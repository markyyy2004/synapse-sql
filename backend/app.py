import hashlib
import os
import re
import sqlite3
import time
from dotenv import load_dotenv
from groq import Groq
import pandas as pd
import plotly.express as px
import streamlit as st

# Environment & API Key Setup
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
  st.error("Please add GROQ_API_KEY in your .env file.")
  st.stop()

client = Groq(api_key=api_key)
MODEL_NAME = "llama-3.3-70b-versatile"

# Page Configuration
st.set_page_config(
    page_title="AI Data Analyst Agent", page_icon="⚡", layout="wide"
)
st.title("⚡ Text-to-SQL AI Data Agent")
st.caption(
    "Query your databases and CSVs with natural language and auto-visualizations."
)

# Initialize Session State
if "db_path" not in st.session_state:
  st.session_state.db_path = "sales.db"
if "messages" not in st.session_state:
  st.session_state.messages = []
if "uploaded_hash" not in st.session_state:
  st.session_state.uploaded_hash = None


# Safe LLM Caller
def call_llm(prompt: str) -> str:
  response = client.chat.completions.create(
      model=MODEL_NAME,
      messages=[{"role": "user", "content": prompt}],
      temperature=0.0,
  )
  return response.choices[0].message.content.strip()


# Dynamic Database Schema Introspection
def get_db_schema(db_path: str) -> str:
  if not os.path.exists(db_path):
    return "No database found."
  try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE"
        " 'sqlite_%';"
    )
    tables = cursor.fetchall()
    schema_details = []

    for (table_name,) in tables:
      cursor.execute(f"PRAGMA table_info('{table_name}');")
      cols = [f"{col[1]} ({col[2]})" for col in cursor.fetchall()]
      schema_details.append(f"Table `{table_name}`: {', '.join(cols)}")

    conn.close()
    return (
        "\n".join(schema_details)
        if schema_details
        else "No tables found in database."
    )
  except Exception as e:
    return f"Error reading schema: {e}"


# Generate SQL with Schema Context
def generate_sql(
    question: str, schema_info: str, prev_error: str = None
) -> str:
  error_prompt = (
      f"\nPrevious query failed with error: {prev_error}. Correct the SQLite"
      " syntax."
      if prev_error
      else ""
  )

  prompt = f"""You are an expert SQLite analyst.
Given the SQLite schema:
{schema_info}
{error_prompt}

Generate an SQLite query to answer: "{question}"

Rules:
1. Return ONLY the raw SQL query.
2. DO NOT use markdown code blocks, backticks, or explanatory text.
3. Use ONLY read-only SELECT queries.
4. Ensure proper aggregations, joins, and column aliasing where appropriate.
"""
  return call_llm(prompt)


# Clean generated SQL strings
def clean_sql(sql_code: str) -> str:
  sql_clean = re.sub(
      r"```(sql)?", "", sql_code, flags=re.IGNORECASE
  ).strip()
  if sql_clean.startswith(('"', "'")) and sql_clean.endswith(('"', "'")):
    sql_clean = sql_clean[1:-1]
  return sql_clean.strip()


# Execute SQL Query with Read-Only Safety
def run_query(sql_query: str, db_path: str):
  forbidden = ["DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE "]
  if any(keyword in sql_query.upper() for keyword in forbidden):
    return (
        None,
        None,
        "Security Alert: Modifications to the database are restricted.",
    )

  try:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cursor = conn.cursor()
    cursor.execute(sql_query)
    results = cursor.fetchall()
    cols = (
        [desc[0] for desc in cursor.description] if cursor.description else []
    )
    conn.close()
    return results, cols, None
  except Exception as e:
    return None, None, str(e)


# Format Natural Language Summary
def format_answer(question: str, sql: str, df: pd.DataFrame) -> str:
  prompt = f"""User Question: {question}
SQL Executed: {sql}
Data Summary (First 10 rows):
{df.head(10).to_string(index=False)}

Provide a concise, 1-2 sentence response directly answering the user's question with the relevant numbers."""

  try:
    return call_llm(prompt)
  except Exception:
    return "Query executed successfully. Displaying tabular results below:"


# Dynamic Auto-Chart Generator
def render_chart(df: pd.DataFrame, cols: list):
  if len(df) <= 1 or len(cols) < 2:
    return

  numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
  categorical_cols = df.select_dtypes(
      include=["object", "string", "category", "datetime"]
  ).columns.tolist()

  if len(numeric_cols) >= 1 and len(categorical_cols) >= 1:
    x_col = categorical_cols[0]
    y_col = numeric_cols[0]
    fig = px.bar(
        df,
        x=x_col,
        y=y_col,
        title=f"{y_col.replace('_', ' ').title()} by {x_col.replace('_', ' ').title()}",
        template="plotly_white",
    )
    st.plotly_chart(fig, use_container_width=True)


# Sidebar Controls
with st.sidebar:
  st.header("📁 Data Source")
  uploaded_file = st.file_uploader(
      "Upload CSV or SQLite DB", type=["csv", "db", "sqlite"]
  )

  if uploaded_file is not None:
    file_bytes = uploaded_file.getvalue()
    file_hash = hashlib.md5(file_bytes).hexdigest()

    if st.session_state.uploaded_hash != file_hash:
      if uploaded_file.name.endswith(".csv"):
        df_upload = pd.read_csv(uploaded_file)
        table_name = re.sub(r"\W+", "_", uploaded_file.name.rsplit(".", 1)[0])
        conn = sqlite3.connect("uploaded_data.db")
        df_upload.to_sql(table_name, conn, if_exists="replace", index=False)
        conn.close()
        st.session_state.db_path = "uploaded_data.db"
        st.session_state.uploaded_hash = file_hash
        st.success(f"Loaded table `{table_name}` ({len(df_upload)} rows)")
      else:
        with open("uploaded_data.db", "wb") as f:
          f.write(file_bytes)
        st.session_state.db_path = "uploaded_data.db"
        st.session_state.uploaded_hash = file_hash
        st.success("Loaded SQLite database.")

  st.divider()
  st.subheader("🗄️ Active Schema")
  current_schema = get_db_schema(st.session_state.db_path)
  st.code(current_schema, language="sql")

  if st.button("Clear Conversation"):
    st.session_state.messages = []
    st.rerun()

# Render Chat History
for msg in st.session_state.messages:
  with st.chat_message(msg["role"]):
    st.markdown(msg["content"])
    if "sql" in msg:
      with st.expander("View SQL"):
        st.code(msg["sql"], language="sql")
    if "dataframe" in msg and msg["dataframe"] is not None:
      st.dataframe(msg["dataframe"], use_container_width=True)

# User Chat Input
if user_prompt := st.chat_input("Ask a question about your data..."):
  st.session_state.messages.append({"role": "user", "content": user_prompt})
  with st.chat_message("user"):
    st.markdown(user_prompt)

  with st.chat_message("assistant"):
    error = None
    results, cols = None, None
    sql_query = ""

    with st.spinner("Analyzing and querying database..."):
      for attempt in range(2):
        try:
          raw_sql = generate_sql(
              user_prompt,
              current_schema,
              prev_error=error if attempt > 0 else None,
          )
          sql_query = clean_sql(raw_sql)
          results, cols, error = run_query(sql_query, st.session_state.db_path)
          if not error:
            break
        except Exception as e:
          error = str(e)

    if error:
      err_text = f"❌ **Execution Error:** `{error}`"
      st.markdown(err_text)
      st.session_state.messages.append(
          {"role": "assistant", "content": err_text}
      )
    else:
      df_result = (
          pd.DataFrame(results, columns=cols) if cols else pd.DataFrame()
      )

      with st.spinner("Summarizing insights..."):
        summary = (
            format_answer(user_prompt, sql_query, df_result)
            if not df_result.empty
            else "No matching records found."
        )

      st.markdown(summary)

      with st.expander("View Executed SQL"):
        st.code(sql_query, language="sql")

      if not df_result.empty:
        st.dataframe(df_result, use_container_width=True)
        render_chart(df_result, cols)

      st.session_state.messages.append({
          "role": "assistant",
          "content": summary,
          "sql": sql_query,
          "dataframe": df_result if not df_result.empty else None,
      })