from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

# ---------------------------
# USER MODEL
# ---------------------------
class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # "volunteer", "ngo", "admin"
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    verified = db.Column(db.Boolean, default=False)

    # Volunteer-specific
    points = db.Column(db.Integer, default=0)
    badges = db.Column(db.String(50), default="")

    # Relationships
    tasks = db.relationship("Task", backref="ngo", lazy=True)          # NGO → Tasks
    submissions = db.relationship("Submission", backref="volunteer", lazy=True)  # Volunteer → Submissions

    def __repr__(self):
        return f"<User {self.name} ({self.role})>"


# ---------------------------
# TASK MODEL
# ---------------------------
class Task(db.Model):
    __tablename__ = "tasks"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    location = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Linked NGO
    ngo_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    # Relationship
    submissions = db.relationship("Submission", backref="task", lazy=True)

    def __repr__(self):
        return f"<Task {self.title}>"


# ---------------------------
# SUBMISSION MODEL
# ---------------------------
class Submission(db.Model):
    __tablename__ = "submissions"

    id = db.Column(db.Integer, primary_key=True)
    proof_url = db.Column(db.String(300), nullable=False)
    status = db.Column(db.String(20), default="Pending")  # Pending / Approved / Rejected
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Linked Volunteer
    volunteer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    # Linked Task
    task_id = db.Column(db.Integer, db.ForeignKey("tasks.id"), nullable=False)

    # Review info
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)  # NGO reviewer
    reviewed_at = db.Column(db.DateTime, nullable=True)

    def __repr__(self):
        return f"<Submission Task:{self.task_id} Volunteer:{self.volunteer_id} Status:{self.status}>"


# ---------------------------
# CERTIFICATE MODEL
# ---------------------------
class Certificate(db.Model):
    __tablename__ = "certificates"

    id = db.Column(db.Integer, primary_key=True)
    volunteer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    issued_at = db.Column(db.DateTime, default=datetime.utcnow)
    file_url = db.Column(db.String(300), nullable=True)

    def __repr__(self):
        return f"<Certificate Volunteer:{self.volunteer_id}>"


# ---------------------------
# LEADERBOARD MODEL
# ---------------------------
class Leaderboard(db.Model):
    __tablename__ = "leaderboard"

    id = db.Column(db.Integer, primary_key=True)
    volunteer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    points = db.Column(db.Integer, default=0)

    def __repr__(self):
        return f"<Leaderboard Volunteer:{self.volunteer_id} Points:{self.points}>"
