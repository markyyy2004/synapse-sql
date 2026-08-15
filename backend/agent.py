import os
import re
import time
from typing import Annotated, List, TypedDict, Any, Dict, Optional
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from sqlalchemy import create_engine, inspect, text

load_dotenv()

llm = ChatGroq(
    model_name="llama-3.3-70b-versatile",
    temperature=0,
    api_key=os.getenv("GROQ_API_KEY"),
)

DEFAULT_DB_URI = "sqlite:///sales.db"
MAX_RETRIES = 3


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    db_uri: str
    schema: str
    sql_query: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    raw_error: str
    retry_count: int
    execution_time_ms: float
    correction_history: List[str]
    explain_plan: str


def get_dialect(db_uri: str) -> str:
    if "postgres" in db_uri:
        return "postgresql"
    elif "mysql" in db_uri:
        return "mysql"
    return "sqlite"


def get_schema_node(state: AgentState):
    db_uri = state.get("db_uri") or DEFAULT_DB_URI
    try:
        engine = create_engine(db_uri)
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        schema_info = []
        for table in tables:
            cols = [
                f"{col['name']} ({str(col['type'])})"
                for col in inspector.get_columns(table)
            ]
            schema_info.append(f"Table `{table}`: {', '.join(cols)}")

        engine.dispose()
        if not schema_info:
            return {"schema": "Database connected, but no tables found."}
        return {"schema": "\n".join(schema_info)}
    except Exception as e:
        return {"schema": f"Error inspecting schema: {str(e)}"}


def generate_sql_node(state: AgentState):
    schema = state["schema"]
    db_uri = state.get("db_uri") or DEFAULT_DB_URI
    dialect = get_dialect(db_uri)

    history_prompts = []
    for msg in state["messages"]:
        if isinstance(msg, HumanMessage):
            history_prompts.append(f"User: {msg.content}")
        elif isinstance(msg, AIMessage):
            history_prompts.append(f"Assistant: {msg.content}")

    conversation_history = "\n".join(history_prompts)

    system_prompt = f"""You are a {dialect.upper()} SQL expert assistant.
Current Database Schema:
{schema}

Conversation History & Context:
{conversation_history}

Generate ONLY a single valid {dialect.upper()} SELECT query that answers the user's latest request in the context of this conversation.
Rules:
1. Return ONLY the raw SQL query. Do not wrap in markdown or backticks.
2. Ensure correct quoting and syntax according to {dialect.upper()} conventions.
3. Do not include commentary, markdown backticks, or explanations."""

    response = llm.invoke([SystemMessage(content=system_prompt)])
    raw_sql = response.content.strip()
    clean_query = re.sub(r"```(sql)?", "", raw_sql).strip()
    return {
        "sql_query": clean_query,
        "retry_count": 0,
        "correction_history": [],
        "raw_error": "",
        "explain_plan": "",
    }


def run_query_node(state: AgentState):
    sql_query = state["sql_query"]
    db_uri = state.get("db_uri") or DEFAULT_DB_URI
    dialect = get_dialect(db_uri)
    retry_count = state.get("retry_count", 0)

    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE"]
    if any(k in sql_query.upper() for k in forbidden):
        return {
            "columns": [],
            "rows": [],
            "raw_error": "Error: Only read-only SELECT queries are allowed.",
            "retry_count": MAX_RETRIES,
            "execution_time_ms": 0.0,
            "explain_plan": "Security policy prevented EXPLAIN execution.",
        }

    start_time = time.time()
    try:
        engine = create_engine(db_uri)
        with engine.connect() as conn:
            # 1. Execute the main query
            result = conn.execute(text(sql_query))
            cols = list(result.keys()) if result.returns_rows else []
            raw_rows = result.fetchall() if result.returns_rows else []
            structured_rows = [dict(zip(cols, list(r))) for r in raw_rows]

            # 2. Extract EXPLAIN Execution Plan
            explain_text = ""
            try:
                if dialect == "postgresql":
                    explain_res = conn.execute(text(f"EXPLAIN (ANALYZE, COSTS, VERBOSE) {sql_query}"))
                    explain_lines = [r[0] for r in explain_res.fetchall()]
                    explain_text = "\n".join(explain_lines)
                elif dialect == "mysql":
                    explain_res = conn.execute(text(f"EXPLAIN {sql_query}"))
                    exp_cols = list(explain_res.keys())
                    exp_rows = [list(r) for r in explain_res.fetchall()]
                    explain_text = f"Headers: {', '.join(exp_cols)}\n" + "\n".join(
                        [str(r) for r in exp_rows]
                    )
                else:  # sqlite
                    explain_res = conn.execute(text(f"EXPLAIN QUERY PLAN {sql_query}"))
                    explain_lines = [
                        f"[id={r[0]}, parent={r[1]}] {r[3]}"
                        for r in explain_res.fetchall()
                    ]
                    explain_text = "\n".join(explain_lines) if explain_lines else "SCAN TABLE (Direct execution)"
            except Exception as exp_err:
                explain_text = f"Could not generate EXPLAIN plan: {str(exp_err)}"

        engine.dispose()
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "columns": cols,
            "rows": structured_rows,
            "raw_error": "",
            "execution_time_ms": elapsed_ms,
            "explain_plan": explain_text,
        }
    except Exception as e:
        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        error_msg = str(e)
        return {
            "columns": [],
            "rows": [],
            "raw_error": error_msg,
            "retry_count": retry_count + 1,
            "execution_time_ms": elapsed_ms,
            "explain_plan": "",
        }


def correct_sql_node(state: AgentState):
    schema = state["schema"]
    db_uri = state.get("db_uri") or DEFAULT_DB_URI
    dialect = get_dialect(db_uri)
    failed_sql = state["sql_query"]
    error = state["raw_error"]
    retry_count = state.get("retry_count", 1)
    history = state.get("correction_history", [])

    prompt = f"""You are an expert {dialect.upper()} query debugger.
A previous SQL query failed to execute against the database.

Database Schema:
{schema}

Failed Query:
{failed_sql}

Database Error Traceback:
{error}

Instructions:
1. Carefully diagnose the error (e.g. column not found, incorrect grouping, missing alias, incorrect quote characters).
2. Rewrite and fix the query for {dialect.upper()}.
3. Return ONLY the single corrected raw SQL query. No markdown blocks, no backticks, no comments, no explanation."""

    response = llm.invoke([SystemMessage(content=prompt)])
    corrected_sql = re.sub(r"```(sql)?", "", response.content.strip()).strip()

    updated_history = history + [
        f"Attempt {retry_count} failed with '{error}'. Corrected to: {corrected_sql}"
    ]

    return {
        "sql_query": corrected_sql,
        "correction_history": updated_history,
    }


def should_retry(state: AgentState):
    error = state.get("raw_error", "")
    retry_count = state.get("retry_count", 0)

    if error and retry_count < MAX_RETRIES:
        return "correct_sql"
    return "synthesize"


def synthesize_response_node(state: AgentState):
    user_question = state["messages"][-1].content
    sql_query = state["sql_query"]
    rows = state["rows"]
    error = state.get("raw_error")

    if error:
        return {
            "messages": [
                AIMessage(
                    content=f"Could not fulfill the query after {MAX_RETRIES} attempts. Error: {error}"
                )
            ]
        }

    prompt = f"""User Request: {user_question}
Executed SQL: {sql_query}
Data Sample: {rows[:10]}

Provide a concise, direct natural language answer (1-2 sentences). State figures directly without setup fluff."""

    response = llm.invoke([SystemMessage(content=prompt)])
    return {"messages": [AIMessage(content=response.content)]}


# Build Workflow Graph
workflow = StateGraph(AgentState)

workflow.add_node("get_schema", get_schema_node)
workflow.add_node("generate_sql", generate_sql_node)
workflow.add_node("run_query", run_query_node)
workflow.add_node("correct_sql", correct_sql_node)
workflow.add_node("synthesize", synthesize_response_node)

workflow.add_edge(START, "get_schema")
workflow.add_edge("get_schema", "generate_sql")
workflow.add_edge("generate_sql", "run_query")

workflow.add_conditional_edges(
    "run_query",
    should_retry,
    {
        "correct_sql": "correct_sql",
        "synthesize": "synthesize",
    },
)

workflow.add_edge("correct_sql", "run_query")
workflow.add_edge("synthesize", END)

sql_graph = workflow.compile()