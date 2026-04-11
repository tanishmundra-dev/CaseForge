from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from seed import seed
from routers import instructor, trainee

app = FastAPI(title="CaseForge API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(instructor.router, prefix="/api/instructor", tags=["instructor"])
app.include_router(trainee.router, prefix="/api/trainee", tags=["trainee"])


@app.on_event("startup")
def startup():
    seed()
