from fastapi import APIRouter
from models import Course
from database import db
from services.generation import generate_case_study, chat_with_mission_control
import uuid

router = APIRouter()


# ── Course CRUD ───────────────────────────────────────────────

@router.get("/courses")
def list_courses():
    """All courses (draft + published) for the instructor."""
    return [c.dict() for c in db["courses"].values()]


@router.get("/courses/{course_id}")
def get_course(course_id: str):
    c = db["courses"].get(course_id)
    if not c:
        return {"error": "Not found"}
    return c.dict()


@router.post("/courses")
def create_course(payload: dict):
    """Save a generated course (defaults to draft)."""
    course_id = payload.get("id") or f"course-{uuid.uuid4().hex[:6]}"
    course = Course(id=course_id, **{k: v for k, v in payload.items() if k != "id"})
    if not course.status:
        course.status = "draft"
    db["courses"][course.id] = course
    return course.dict()


@router.put("/courses/{course_id}")
def update_course(course_id: str, payload: dict):
    existing = db["courses"].get(course_id)
    if not existing:
        return {"error": "Not found"}
    updated = existing.dict()
    updated.update(payload)
    course = Course(**updated)
    db["courses"][course_id] = course
    return course.dict()


@router.post("/courses/{course_id}/publish")
def publish_course(course_id: str):
    c = db["courses"].get(course_id)
    if not c:
        return {"error": "Not found"}
    c.status = "published"
    return c.dict()


# ── Mission Control ───────────────────────────────────────────

@router.post("/mission-control/generate")
def generate(payload: dict):
    return generate_case_study(payload["prompt"])


@router.post("/mission-control/chat")
def chat(payload: dict):
    return chat_with_mission_control(
        payload["messages"], payload.get("course_context")
    )


# ── Analytics ─────────────────────────────────────────────────

@router.get("/analytics/summary")
def analytics_summary():
    subs = db["submissions"]
    total = len(subs)
    avg = sum(s.overall_score for s in subs) / total if total else 0
    return {
        "total_trainees": len(set(s.trainee_name for s in subs)),
        "total_submissions": total,
        "avg_score": round(avg, 1),
        "completion_rate": round(
            len([s for s in subs if s.overall_score > 0]) / total * 100
        ) if total else 0,
        "courses_published": len(
            [c for c in db["courses"].values() if c.status == "published"]
        ),
    }


@router.get("/analytics/submissions")
def analytics_submissions():
    return sorted(
        [s.dict() for s in db["submissions"]],
        key=lambda s: s["overall_score"],
        reverse=True,
    )


@router.get("/analytics/score-distribution")
def score_distribution():
    buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for s in db["submissions"]:
        sc = s.overall_score
        if sc <= 20:
            buckets["0-20"] += 1
        elif sc <= 40:
            buckets["21-40"] += 1
        elif sc <= 60:
            buckets["41-60"] += 1
        elif sc <= 80:
            buckets["61-80"] += 1
        else:
            buckets["81-100"] += 1
    return [{"range": k, "count": v} for k, v in buckets.items()]
