from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List
from datetime import datetime
import re
import logging

logger = logging.getLogger("auth-service")

class UserBase(BaseModel):
    email: EmailStr
    username: str

    @validator('username')
    def validate_username(cls, v):
        try:
            if len(v) < 3:
                raise ValueError('Username must be at least 3 characters long')
            if len(v) > 50:
                raise ValueError('Username must be less than 50 characters')
            if not re.match(r'^[a-zA-Z0-9_]+$', v):
                raise ValueError('Username can only contain letters, numbers and underscores')
            return v
        except Exception as e:
            logger.warning(f"Username validation failed: {str(e)}")
            raise

class UserCreate(UserBase):
    password: str

    @validator('password')
    def validate_password(cls, v):
        try:
            if len(v) < 8:
                raise ValueError('Password must be at least 8 characters long')
            if not any(char.isdigit() for char in v):
                raise ValueError('Password must contain at least one digit')
            if not any(char.isupper() for char in v):
                raise ValueError('Password must contain at least one uppercase letter')
            return v
        except Exception as e:
            logger.warning(f"Password validation failed: {str(e)}")
            raise

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_superuser: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

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
    is_superuser: Optional[bool] = None
    permissions: List[str] = []