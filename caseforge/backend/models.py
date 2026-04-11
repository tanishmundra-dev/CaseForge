from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ── Test Case for assignments ──────────────────────────────────
class TestCase(BaseModel):
    input: str
    expected_output: str
    description: str = ""


# ── Rubric Item ────────────────────────────────────────────────
class RubricItem(BaseModel):
    criterion: str
    excellent: str
    acceptable: str
    poor: str
    weight: int


# ── Assignment (leaf node — the thing trainees solve) ──────────
class Assignment(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str = "Intermediate"
    hints: list[str] = []
    pitfalls: list[str] = []
    aha_moment: str = ""
    starter_code: str = ""
    test_cases: list[TestCase] = []
    rubric: list[RubricItem] = []


# ── Class (belongs to a Week) ─────────────────────────────────
class Class(BaseModel):
    id: str
    number: int
    title: str
    description: str
    assignments: list[Assignment] = []


# ── Week (belongs to a Course) ────────────────────────────────
class Week(BaseModel):
    id: str
    number: int
    title: str
    classes: list[Class] = []


# ── Course (top-level) ────────────────────────────────────────
class Course(BaseModel):
    id: str
    title: str
    description: str
    difficulty: str = "Intermediate"
    status: str = "draft"           # draft | published
    created_at: datetime = datetime.now()
    weeks: list[Week] = []


# ── Submission / Grading ──────────────────────────────────────
class CriterionScore(BaseModel):
    criterion: str
    score: int
    level: str
    feedback: str


class Submission(BaseModel):
    id: str
    course_id: str
    class_id: str
    assignment_id: str
    trainee_name: str
    code: str
    execution_output: str = ""
    overall_score: int
    grade: str
    criterion_scores: list[CriterionScore]
    overall_feedback: str
    strengths: list[str]
    improvements: list[str]
    submitted_at: datetime = datetime.now()
