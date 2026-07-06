import importlib
import os
from importlib import resources
from pathlib import Path
from typing import Optional, Sequence

import grpc


BASE_DIR = Path(__file__).resolve().parent
PROTO_PATH = BASE_DIR / "clouddrive.proto"
GENERATED_FLAG = BASE_DIR / ".generated_clouddrive_stub"


def ensure_proto_generated() -> None:
    pb2_file = BASE_DIR / "clouddrive_pb2.py"
    pb2_grpc_file = BASE_DIR / "clouddrive_pb2_grpc.py"
    if pb2_file.exists() and pb2_grpc_file.exists():
        return

    if not PROTO_PATH.exists():
        raise FileNotFoundError(f"Missing proto file: {PROTO_PATH}")

    from grpc_tools import protoc

    proto_include = resources.files("grpc_tools").joinpath("_proto")
    result = protoc.main(
        [
            "grpc_tools.protoc",
            f"-I{BASE_DIR}",
            f"-I{proto_include}",
            f"--python_out={BASE_DIR}",
            f"--grpc_python_out={BASE_DIR}",
            str(PROTO_PATH),
        ]
    )
    if result != 0:
        raise RuntimeError(f"Failed to generate gRPC stubs from {PROTO_PATH}")

    GENERATED_FLAG.write_text("generated\n", encoding="utf-8")


ensure_proto_generated()

clouddrive_pb2 = importlib.import_module("clouddrive_pb2")
clouddrive_pb2_grpc = importlib.import_module("clouddrive_pb2_grpc")


class CloudDriveClient:
    def __init__(
        self,
        address: str,
        api_token: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        totp_code: Optional[str] = None,
    ) -> None:
        self.address = address
        self.api_token = api_token
        self.username = username
        self.password = password
        self.totp_code = totp_code
        self.channel = grpc.insecure_channel(address)
        self.stub = clouddrive_pb2_grpc.CloudDriveFileSrvStub(self.channel)
        self._jwt_token: Optional[str] = api_token

    def close(self) -> None:
        self.channel.close()

    def _metadata(self) -> Sequence[tuple[str, str]]:
        if not self._jwt_token:
            return []
        return [("authorization", f"Bearer {self._jwt_token}")]

    def authenticate(self) -> None:
        if self._jwt_token:
            return

        if not self.username or not self.password:
            raise ValueError(
                "CloudDrive2 authentication is not configured. "
                "Set CLOUDDRIVE_API_TOKEN or CLOUDDRIVE_USERNAME/CLOUDDRIVE_PASSWORD."
            )

        request = clouddrive_pb2.GetTokenRequest(
            userName=self.username,
            password=self.password,
        )
        if self.totp_code:
            request.totpCode = self.totp_code

        response = self.stub.GetToken(request)
        if not response.success:
            raise RuntimeError(response.errorMessage or "CloudDrive2 authentication failed")

        self._jwt_token = response.token

    def add_offline_file(
        self,
        url: str,
        to_folder: str,
        check_folder_after_secs: int = 30,
    ) -> dict:
        self.authenticate()
        response = self.stub.AddOfflineFiles(
            clouddrive_pb2.AddOfflineFileRequest(
                urls=url,
                toFolder=to_folder,
                checkFolderAfterSecs=check_folder_after_secs,
            ),
            metadata=self._metadata(),
        )
        return {
            "success": bool(response.success),
            "errorMessage": response.errorMessage,
            "resultFilePaths": list(response.resultFilePaths),
        }

    def list_offline_files_by_path(self, path: str) -> list:
        self.authenticate()
        response = self.stub.ListOfflineFilesByPath(
            clouddrive_pb2.FileRequest(path=path),
            metadata=self._metadata(),
        )
        return list(response.offlineFiles)


def build_client(api_token: Optional[str] = None) -> CloudDriveClient:
    configured_token = api_token.strip() if api_token and api_token.strip() else os.getenv("CLOUDDRIVE_API_TOKEN")
    return CloudDriveClient(
        address=os.getenv("CLOUDDRIVE_GRPC_ADDRESS", "127.0.0.1:19798"),
        api_token=configured_token,
        username=os.getenv("CLOUDDRIVE_USERNAME"),
        password=os.getenv("CLOUDDRIVE_PASSWORD"),
        totp_code=os.getenv("CLOUDDRIVE_TOTP_CODE"),
    )
