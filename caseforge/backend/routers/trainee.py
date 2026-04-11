from fastapi import APIRouter
from database import db
from services.grading import grade_submission, companion_chat
from services.code_runner import run_python_code
from models import Submission
import uuid

router = APIRouter()


# ── Course browsing (published only) ─────────────────────────

@router.get("/courses")
def list_courses():
    """Trainees only see published courses (summary level)."""
    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "difficulty": c.difficulty,
            "status": c.status,
            "week_count": len(c.weeks),
            "class_count": sum(len(w.classes) for w in c.weeks),
        }
        for c in db["courses"].values()
        if c.status == "published"
    ]


@router.get("/courses/{course_id}")
def get_course(course_id: str):
    """Full course with weeks/classes/assignments."""
    c = db["courses"].get(course_id)
    if not c or c.status != "published":
        return {"error": "Not found"}
    return c.dict()


@router.get("/courses/{course_id}/classes/{class_id}")
def get_class(course_id: str, class_id: str):
    """Single class with its assignments."""
    c = db["courses"].get(course_id)
    if not c:
        return {"error": "Course not found"}
    for week in c.weeks:
        for cls in week.classes:
            if cls.id == class_id:
                return {
                    "course_id": c.id,
                    "course_title": c.title,
                    "week_number": week.number,
                    "week_title": week.title,
                    **cls.dict(),
                }
    return {"error": "Class not found"}


@router.get("/courses/{course_id}/classes/{class_id}/assignments/{assignment_id}")
def get_assignment(course_id: str, class_id: str, assignment_id: str):
    """Single assignment with full details."""
    c = db["courses"].get(course_id)
    if not c:
        return {"error": "Course not found"}
    for week in c.weeks:
        for cls in week.classes:
            if cls.id == class_id:
                for asn in cls.assignments:
                    if asn.id == assignment_id:
                        return {
                            "course_id": c.id,
                            "course_title": c.title,
                            "week_number": week.number,
                            "class_id": cls.id,
                            "class_number": cls.number,
                            "class_title": cls.title,
                            **asn.dict(),
                        }
    return {"error": "Assignment not found"}


# ── Code execution ────────────────────────────────────────────

@router.post("/run")
def run_code(payload: dict):
    """Execute Python code and return stdout/stderr."""
    code = payload.get("code", "")
    result = run_python_code(code, timeout=10)
    return result


# ── Submission / Grading ──────────────────────────────────────

@router.post("/submit")
def submit(payload: dict):
    course_id = payload.get("course_id", "")
    class_id = payload.get("class_id", "")
    assignment_id = payload.get("assignment_id", "")
    code = payload.get("code", "")

    # Find the assignment for rubric context
    assignment = None
    c = db["courses"].get(course_id)
    if c:
        for week in c.weeks:
            for cls in week.classes:
                if cls.id == class_id:
                    for asn in cls.assignments:
                        if asn.id == assignment_id:
                            assignment = asn
                            break

    if not assignment:
        return {"error": "Assignment not found"}

    # Run the code first
    exec_result = run_python_code(code, timeout=10)

    # Grade it
    result = grade_submission(assignment.dict(), code, exec_result)

    sub = Submission(
        id=f"sub-{uuid.uuid4().hex[:6]}",
        course_id=course_id,
        class_id=class_id,
        assignment_id=assignment_id,
        trainee_name=payload.get("trainee_name", "Demo Trainee"),
        code=code,
        execution_output=exec_result.get("stdout", "") + exec_result.get("stderr", ""),
        **result,
    )
    db["submissions"].append(sub)
    return sub.dict()


# ── Companion Chat ────────────────────────────────────────────

@router.post("/companion/chat")
def companion(payload: dict):
    return companion_chat(
        payload["messages"],
        payload.get("assignment"),
        payload.get("current_code", ""),
    )


# ── Progress ──────────────────────────────────────────────────

@router.get("/progress")
def progress():
    name = "Demo Trainee"
    mine = [s for s in db["submissions"] if s.trainee_name == name]
    ranked = sorted(db["submissions"], key=lambda s: s.overall_score, reverse=True)
    rank = next(
        (i + 1 for i, s in enumerate(ranked) if s.trainee_name == name),
        len(ranked) + 1,
    )
    return {
        "courses_enrolled": len(
            [c for c in db["courses"].values() if c.status == "published"]
        ),
        "completed": len(mine),
        "avg_score": round(sum(s.overall_score for s in mine) / len(mine)) if mine else 0,
        "rank": rank,
        "total": len(set(s.trainee_name for s in db["submissions"])),
        "submissions": [s.dict() for s in mine],
        "leaderboard": [
            {"name": s.trainee_name, "score": s.overall_score, "rank": i + 1}
            for i, s in enumerate(ranked[:10])
        ],
    }
