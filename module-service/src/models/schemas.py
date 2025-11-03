from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class MessageSchema(BaseModel):
    provider_address: str
    hex_data: str
    packet_number: int
    timestamp: str
    raw_message: str

class BatchMessageSchema(BaseModel):
    messages: List[MessageSchema]

class ProviderConnectionSchema(BaseModel):
    address: str
    type: str
    status: str
    last_activity: float
    created_at: Optional[float] = None