import sqlite3

connection = sqlite3.connect("sales.db")
cursor = connection.cursor()

# Create table
cursor.execute(
    """
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY,
        name TEXT,
        country TEXT,
        revenue REAL
    )
"""
)

# Insert sample data
data = [
    (1, "Alice", "USA", 1500.0),
    (2, "Bob", "UK", 800.0),
    (3, "Charlie", "Germany", 2000.0),
    (4, "David", "USA", 1200.0),
    (5, "Eve", "France", 1750.0),
]

cursor.executemany("INSERT OR REPLACE INTO customers VALUES (?, ?, ?, ?)", data)
connection.commit()
connection.close()

print("Database 'sales.db' created successfully.")