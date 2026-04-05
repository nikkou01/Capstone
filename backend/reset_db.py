from pathlib import Path
import argparse
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reset the SafeCCTV MongoDB database.")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip confirmation prompt.",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv(Path(__file__).parent / ".env")
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.getenv("DB_NAME", "safecctv")

    args = parse_args()
    if not args.yes:
        answer = input(f"Reset database '{db_name}'? This cannot be undone. (y/N): ")
        if answer.strip().lower() not in {"y", "yes"}:
            print("Cancelled.")
            return 0

    try:
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        client.drop_database(db_name)
        print(f"Database '{db_name}' reset successfully.")
        print("Start the backend to recreate the default captain account.")
        return 0
    except Exception as exc:
        print(f"ERROR: Failed to reset database '{db_name}': {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
