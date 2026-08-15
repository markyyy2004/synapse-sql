# ⚡ Synapse SQL — Autonomous Natural Language Data Agent

An enterprise-grade, autonomous Text-to-SQL data analytics platform powered by **LangGraph**, **Groq (Llama 3.3 70B)**, **FastAPI**, and **Next.js 15**.

Synapse SQL enables users to query relational databases (SQLite, PostgreSQL, MySQL) and custom CSV files using natural language, producing dialect-compliant SQL queries with auto-healing self-correction, real-time token streaming, and dynamic visual charts.

---

## 🌟 Key Features

* **🧠 Multi-Dialect Neural SQL Generation**: Automatically inspects schemas and constructs precise queries for **PostgreSQL**, **MySQL**, and **SQLite**.


* **🛡️ LangGraph Self-Healing Loop**: Intercepts execution tracebacks, column mismatches, and database errors to autonomously debug and self-correct queries in a closed loop.


* **⚡ Real-Time Token Streaming (SSE)**: Streams natural language synthesis word-by-word with low latency using Server-Sent Events.


* **📊 Dynamic Visual Analytics**: Automatically plots query results with live toggleable views for **Bar**, **Line**, **Area**, and **Pie** charts via Recharts.


* **🔬 Database Execution Plan Visualizer (`EXPLAIN`)**: Inspects query planner strategies, estimated row costs, buffer hits, and scan types.


* **📁 Dynamic CSV Dataset Ingestion**: Drop any CSV file into the interface to instantly load it as a queryable database table.


* **💾 Dual-Format Export**: 1-click downloads for **CSV Result Sets** and **PNG Chart Snapshots** via `html-to-image`.


* **🔮 Cyber-Luxe Glassmorphic UI**: Ambient neon glows, session history persistence, latency telemetry badges, and 1-click SQL clipboard copying.



---

## 🏗️ Architecture & Data Flow

```text
       [ User Inquiries / CSV Uploads ]
                     │
                     ▼
          [ Next.js 15 Frontend ]
      (Tailwind CSS, Lucide, Recharts)
                     │  (Server-Sent Events)
                     ▼
          [ FastAPI Python Backend ]
                     │
                     ▼
       [ LangGraph Multi-Node Workflow ]
   ┌────────────────────────────────────────┐
   │ 1. Schema Inspector                   │
   │ 2. SQL Generation Node (Groq Llama 3) │
   │ 3. Database Execution Node            │
   │ 4. Self-Healing Node (Conditional)    │
   │ 5. EXPLAIN Plan Extractor             │
   │ 6. Response Synthesis (SSE Streaming) │
   └────────────────────────────────────────┘
                     │
   ┌─────────────────┴───────────────────┐
   ▼                                     ▼
[ Local SQLite / Ingested CSVs ]   [ Cloud PostgreSQL / MySQL ]

```

### Pipeline Flow

1. **Schema Extraction:** Inspects tables and column data types dynamically from the target database URI.
2. **SQL Synthesis:** Prompts Groq's `llama-3.3-70b-versatile` with the dialect rules and database schema.
3. **Execution & Safeguards:** Validates that only read-only `SELECT` queries run against the connection pool.
4. **Conditional Self-Healing Edge:** If a query fails, the error message and schema are routed to a debugger node to patch the syntax and re-execute.
5. **Diagnostics & Streaming:** Extracts `EXPLAIN` query plans and streams data payloads alongside tokens directly to the browser.

---

## 📁 Repository Structure

```text
Text to SQL/
├── backend/
│   ├── .env                    # Environment variables (GROQ_API_KEY)
│   ├── agent.py                # LangGraph state machine, self-healing loop & EXPLAIN planner
│   ├── main.py                 # FastAPI server with SSE token streaming & upload endpoints
│   ├── requirements.txt        # Backend dependencies (FastAPI, LangGraph, SQLAlchemy, etc.)
│   ├── sales.db                # Default local SQLite database
│   └── venv/                   # Python virtual environment
│
├── frontend/
│   ├── .env.local              # Frontend environment config
│   ├── package.json            # Node dependencies (recharts, lucide-react, html-to-image, etc.)
│   ├── tsconfig.json           # TypeScript configuration
│   ├── tailwind.config.ts      # Tailwind CSS styling and theme configuration
│   ├── postcss.config.mjs      # PostCSS configuration
│   ├── next.config.ts          # Next.js configuration
│   │
│   ├── public/                 # Static assets and icons
│   │
│   └── src/
│       └── app/
│           ├── api/
│           │   ├── chat/
│           │   │   └── route.ts     # Next.js API route proxy for SSE chat streaming
│           │   ├── test-db/
│           │   │   └── route.ts     # Next.js API route proxy for database connection testing
│           │   └── upload/
│           │       └── route.ts     # Next.js API route proxy for CSV dataset uploads
│           │
│           ├── ChatInterface.tsx    # Cyberpunk HUD UI, chart selectors, EXPLAIN viewer & history
│           ├── globals.css          # Futuristic glassmorphism styles, cyber-grid & custom scrollbars
│           ├── layout.tsx           # Root Next.js layout
│           └── page.tsx             # Root home page rendering <ChatInterface />

```

---

## 🛠️ Tech Stack

* **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Recharts, `html-to-image`, Lucide Icons.


* **Backend**: Python 3.10+, FastAPI, LangGraph, LangChain, Groq API (`llama-3.3-70b-versatile`), SQLAlchemy, PyMySQL, Psycopg2-binary, Pandas, Uvicorn.



---

## 🚀 Quickstart Installation

### Prerequisites

* [Node.js](https://nodejs.org/) (v18+)


* [Python](https://www.python.org/) (v3.10+)


* [Groq API Key](https://console.groq.com/)


---

### 1. Backend Setup

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate a virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Set your Groq API Key
echo GROQ_API_KEY=your_groq_api_key_here > .env

# 5. Start the FastAPI development server
python -m uvicorn main:app --reload --port 8000

```

---

### 2. Frontend Setup

```bash
# 1. Open a new terminal and navigate to frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start Next.js development server
npm run dev

```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔌 Database Connection Strings

Manage target databases dynamically through the **Settings (⚙️)** panel in the sidebar:

* **SQLite (Local)**: `sqlite:///sales.db`

* **PostgreSQL (e.g. Neon, Supabase, AWS RDS)**: `postgresql://user:password@host:5432/dbname?sslmode=require`

* **MySQL**: `mysql+pymysql://user:password@localhost:3306/dbname`


---

## 🔒 Security & Safe Execution

* **Read-Only Enforced**: Rejects queries attempting `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, or `TRUNCATE`.
* **Isolated Environment**: Database connection strings remain stored locally on client sessions and are routed securely through proxy handlers.

---

## 📄 License

MIT License. Free for open-source and commercial use.