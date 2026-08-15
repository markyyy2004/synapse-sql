import os
import re
import sqlite3
from dotenv import load_dotenv
from google import genai

load_dotenv()

# Initialize the Gemini client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def generate_sql(question: str) -> str:
  prompt = f"""You are an expert SQL assistant. Return ONLY raw SQL and do not use markdown.
Do not wrap in quotes.
Use table: customers(id, name, country, revenue).

Question: {question}"""

  # Generate content using Gemini 2.5 Flash / 2.0 Flash
  response = client.models.generate_content(
      model="gemini-2.5-flash",
      contents=prompt,
  )
  return response.text.strip()


def clean_sql(sql_code: str) -> str:
  sql_clean = re.sub(r"```sql", "", sql_code, flags=re.IGNORECASE)
  sql_clean = re.sub(r"```", "", sql_clean)
  return sql_clean.strip()


def run_query(sql_query: str):
  connection = sqlite3.connect("sales.db")
  cursor = connection.cursor()
  try:
    cursor.execute(sql_query)
    results = cursor.fetchall()
  except Exception as e:
    results = f"Error: {e}"
  finally:
    connection.close()
  return results


def ask_database(question: str):
  raw_sql = generate_sql(question)
  cleaned_sql = clean_sql(raw_sql)
  print(f"\n[Generated SQL]: {cleaned_sql}")
  return run_query(cleaned_sql)


if __name__ == "__main__":
  while True:
    user_query = input(
        "\nPlease enter your question (or type 'exit' to quit): "
    )
    if user_query.strip().lower() in ["exit", "quit"]:
      break
    answer = ask_database(user_query)
    print(f"[Query Result]: {answer}")