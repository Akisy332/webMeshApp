from pydantic import BaseModel
from typing import Optional, List
from .user_models import UserResponse

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: UserResponse

class TokenData(BaseModel):
    username: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: str

class TokenValidationRequest(BaseModel):
    token: str

class TokenValidationResponse(BaseModel):
    valid: bool
    username: Optional[str] = None
    user_id: Optional[int] = None
    email: Optional[str] = None
    role: Optional[str] = None
    permissions: List[str] = []

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str