import logging
import os
import sys

import grpc
from flask import Flask, jsonify, request

from cd2_client import CloudDriveClient, build_client


def read_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


app = Flask(__name__)
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("cd2api")


@app.get("/health")
def health() -> tuple[dict, int]:
    return {
        "ok": True,
        "grpc_address": os.getenv("CLOUDDRIVE_GRPC_ADDRESS", "127.0.0.1:19798"),
        "auth_mode": "api_token" if os.getenv("CLOUDDRIVE_API_TOKEN") else "username_password",
    }, 200


@app.post("/offline-download")
def offline_download():
    payload = request.get_json(silent=True) or {}
    magnet = (payload.get("magnet") or payload.get("url") or "").strip()
    to_folder = (payload.get("directory") or payload.get("toFolder") or "").strip()
    check_after = payload.get("checkFolderAfterSecs", 30)

    if not magnet:
        return jsonify({"success": False, "error": "Missing magnet/url"}), 400
    if not to_folder:
        return jsonify({"success": False, "error": "Missing directory/toFolder"}), 400
    if not isinstance(check_after, int) or check_after < 0:
        return jsonify({"success": False, "error": "checkFolderAfterSecs must be a non-negative integer"}), 400

    client = build_client()
    try:
        result = client.add_offline_file(
            url=magnet,
            to_folder=to_folder,
            check_folder_after_secs=check_after,
        )
    except grpc.RpcError as exc:
        logger.exception("CloudDrive2 RPC failed")
        return (
            jsonify(
                {
                    "success": False,
                    "error": "CloudDrive2 RPC failed",
                    "grpc_code": exc.code().name if exc.code() else None,
                    "details": exc.details(),
                }
            ),
            502,
        )
    except Exception as exc:
        logger.exception("Offline download request failed")
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        client.close()

    status_code = 200 if result["success"] else 400
    return jsonify(result), status_code


def main() -> None:
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "59590"))
    debug = read_bool_env("API_DEBUG", False)
    logger.info("Starting API server on %s:%s", host, port)
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
