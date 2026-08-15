import asyncio
import io
import json
import re
import sqlite3
from decimal import Decimal
from datetime import date, datetime
from typing import Any, Dict, List, Optional
import pandas as pd
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel
from sqlalchemy import create_engine, inspect

from agent import DEFAULT_DB_URI, MAX_RETRIES, llm, sql_graph

app = FastAPI(title="Text-to-SQL AI Agent Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def custom_json_serializer(obj):
    if isinstance(obj, (Decimal, float)):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    db_uri: Optional[str] = DEFAULT_DB_URI


class DBTestRequest(BaseModel):
    db_uri: str


@app.post("/api/test-db")
async def test_db_connection(req: DBTestRequest):
    try:
        engine = create_engine(req.db_uri)
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        engine.dispose()
        return {"success": True, "tables": tables}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    formatted_messages = []
    for msg in request.messages:
        if msg.get("role") == "user":
            formatted_messages.append(HumanMessage(content=msg.get("content", "")))
        elif msg.get("role") == "assistant":
            formatted_messages.append(AIMessage(content=msg.get("content", "")))

    initial_state = {
        "messages": formatted_messages,
        "db_uri": request.db_uri or DEFAULT_DB_URI,
        "schema": "",
        "sql_query": "",
        "columns": [],
        "rows": [],
        "raw_error": "",
        "retry_count": 0,
        "execution_time_ms": 0.0,
        "correction_history": [],
        "explain_plan": "",
    }

    async def event_generator():
        try:
            final_state = await sql_graph.ainvoke(initial_state)

            sql_query = final_state.get("sql_query", "")
            columns = final_state.get("columns", [])
            rows = final_state.get("rows", [])
            error = final_state.get("raw_error", "")
            execution_time_ms = final_state.get("execution_time_ms", 0.0)
            correction_history = final_state.get("correction_history", [])
            explain_plan = final_state.get("explain_plan", "")

            # Serialize all field values safely
            safe_rows = []
            for row in rows:
                safe_row = {}
                for k, v in row.items():
                    if isinstance(v, (Decimal, float)):
                        safe_row[k] = float(v)
                    elif isinstance(v, (datetime, date)):
                        safe_row[k] = str(v)
                    else:
                        safe_row[k] = v
                safe_rows.append(safe_row)

            meta_payload = {
                "type": "metadata",
                "sql": sql_query,
                "columns": columns,
                "rows": safe_rows,
                "execution_time_ms": execution_time_ms,
                "correction_history": correction_history,
                "explain_plan": explain_plan,
            }
            yield f"data: {json.dumps(meta_payload, default=custom_json_serializer)}\n\n"

            if error:
                err_payload = {
                    "type": "token",
                    "content": f"Could not fulfill the query after {MAX_RETRIES} attempts. Error: {error}",
                }
                yield f"data: {json.dumps(err_payload)}\n\n"
                yield "data: [DONE]\n\n"
                return

            user_question = formatted_messages[-1].content if formatted_messages else ""
            prompt = f"""User Request: {user_question}
Executed SQL: {sql_query}
Data Sample: {safe_rows[:10]}

Provide a concise, direct natural language answer (1-2 sentences). State figures directly without setup fluff."""

            async for chunk in llm.astream([SystemMessage(content=prompt)]):
                if chunk.content:
                    token_payload = {"type": "token", "content": chunk.content}
                    yield f"data: {json.dumps(token_payload)}\n\n"
                    await asyncio.sleep(0.01)

            yield "data: [DONE]\n\n"
        except Exception as e:
            err_payload = {"type": "token", "content": f"Server processing error: {str(e)}"}
            yield f"data: {json.dumps(err_payload)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))

        table_name = re.sub(r"\W+", "_", file.filename.rsplit(".", 1)[0]).lower().strip("_")

        conn = sqlite3.connect("sales.db")
        df.to_sql(table_name, conn, if_exists="replace", index=False)
        conn.close()

        return {
            "success": True,
            "table_name": table_name,
            "rows_count": len(df),
            "columns": df.columns.tolist(),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)