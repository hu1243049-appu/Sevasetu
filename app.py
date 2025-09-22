from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from models import db, User, Task, Submission, Certificate
from auth import generate_token, token_required
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import os, csv
from io import StringIO

app = Flask(__name__)
CORS(app)

# Config
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///database.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
bcrypt = Bcrypt(app)

# Create DB
with app.app_context():
    db.create_all()

# Certificates folder
CERT_DIR = "certificates"
os.makedirs(CERT_DIR, exist_ok=True)

# ---------------------------
# AUTH ROUTES
# ---------------------------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    if not data.get("email") or not data.get("password"):
        return jsonify({"error": "Email and password required"}), 400

    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "User already exists"}), 400

    hashed_pw = bcrypt.generate_password_hash(data["password"]).decode("utf-8")
    user = User(
        role=data.get("role", "volunteer"),
        name=data.get("name", ""),
        city=data.get("city", ""),
        state=data.get("state", ""),
        contact=data.get("contact", ""),
        email=data["email"],
        password=hashed_pw,
        verified=(data.get("role") != "ngo")  # NGOs need admin verification
    )
    db.session.add(user)
    db.session.commit()

    token = generate_token(user.id, user.role)
    return jsonify({"message": "User registered", "token": token, "role": user.role})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    user = User.query.filter_by(email=data.get("email")).first()
    if not user or not bcrypt.check_password_hash(user.password, data.get("password", "")):
        return jsonify({"error": "Invalid credentials"}), 401

    token = generate_token(user.id, user.role)
    return jsonify({"message": "Login successful", "token": token, "role": user.role})

# ---------------------------
# VOLUNTEER ROUTES
# ---------------------------
@app.route("/api/join_ngo", methods=["POST"])
@token_required
def join_ngo(current_user):
    if current_user["role"] != "volunteer":
        return jsonify({"error": "Only volunteers can join NGOs"}), 403

    data = request.json
    ngo_id = data.get("ngo_id")
    ngo = User.query.filter_by(id=ngo_id, role="ngo", verified=True).first()
    if not ngo:
        return jsonify({"error": "NGO not found or not verified"}), 404

    volunteer = User.query.get(current_user["user_id"])
    volunteer.ngo_id = ngo.id
    db.session.commit()

    return jsonify({"message": f"Joined NGO {ngo.name} successfully"})

@app.route("/api/tasks", methods=["GET"])
@token_required
def get_tasks(current_user):
    if current_user["role"] == "volunteer" and current_user.get("ngo_id"):
        tasks = Task.query.filter_by(ngo_id=current_user["ngo_id"]).all()
    else:
        tasks = Task.query.all()
    return jsonify([{
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "location": t.location,
        "remote": t.remote,
        "category": t.category,
        "guidelines": t.guidelines
    } for t in tasks])

@app.route("/api/submit_proof", methods=["POST"])
@token_required
def submit_proof(current_user):
    if current_user["role"] != "volunteer":
        return jsonify({"error": "Only volunteers can submit proof"}), 403

    data = request.json
    submission = Submission(
        task_id=data.get("task_id"),
        volunteer_id=current_user["user_id"],
        proof_url=data.get("proof_url"),
        status="Pending"
    )
    db.session.add(submission)
    db.session.commit()
    return jsonify({"message": "Proof submitted successfully"})

@app.route("/api/my_submissions", methods=["GET"])
@token_required
def my_submissions(current_user):
    if current_user["role"] != "volunteer":
        return jsonify({"error": "Only volunteers can view submissions"}), 403

    submissions = Submission.query.filter_by(volunteer_id=current_user["user_id"]).all()
    result = []
    for sub in submissions:
        task = Task.query.get(sub.task_id)
        result.append({
            "submission_id": sub.id,
            "task_id": sub.task_id,
            "task_title": task.title if task else "Deleted Task",
            "proof_url": sub.proof_url,
            "status": sub.status,
            "reviewed_by": sub.reviewed_by,
            "reviewed_at": sub.reviewed_at,
            "submitted_at": sub.created_at
        })

    volunteer = User.query.get(current_user["user_id"])
    if volunteer.points >= 100:
        badge = "Gold"
    elif volunteer.points >= 75:
        badge = "Silver"
    elif volunteer.points >= 50:
        badge = "Bronze"
    else:
        badge = "No badge yet"

    return jsonify({
        "submissions": result,
        "points": volunteer.points,
        "badge": badge
    })

# ---------------------------
# NGO ROUTES
# ---------------------------
@app.route("/api/tasks", methods=["POST"])
@token_required
def create_task(current_user):
    if current_user["role"] != "ngo":
        return jsonify({"error": "Only NGOs can post tasks"}), 403

    data = request.json
    task = Task(
        ngo_id=current_user["user_id"],
        title=data.get("title"),
        description=data.get("description"),
        location=data.get("location"),
        remote=data.get("remote", False),
        category=data.get("category"),
        guidelines=data.get("guidelines")
    )
    db.session.add(task)
    db.session.commit()
    return jsonify({"message": "Task created successfully"})

@app.route("/api/my_tasks", methods=["GET"])
@token_required
def my_tasks(current_user):
    if current_user["role"] != "ngo":
        return jsonify({"error": "Only NGOs can view their tasks"}), 403

    tasks = Task.query.filter_by(ngo_id=current_user["user_id"]).all()
    return jsonify([{
        "id": t.id,
        "title": t.title,
        "description": t.description
    } for t in tasks])

@app.route("/api/ngo_submissions", methods=["GET"])
@token_required
def ngo_submissions(current_user):
    if current_user["role"] != "ngo":
        return jsonify({"error": "Only NGOs can view submissions"}), 403

    tasks = Task.query.filter_by(ngo_id=current_user["user_id"]).all()
    task_ids = [t.id for t in tasks]

    submissions = Submission.query.filter(Submission.task_id.in_(task_ids)).all()
    result = []
    for sub in submissions:
        volunteer = User.query.get(sub.volunteer_id)
        task = Task.query.get(sub.task_id)
        result.append({
            "submission_id": sub.id,
            "task_id": sub.task_id,
            "task_title": task.title if task else "Deleted Task",
            "volunteer_name": volunteer.name if volunteer else "Unknown",
            "proof_url": sub.proof_url,
            "status": sub.status,
            "submitted_at": sub.created_at,
            "reviewed_at": sub.reviewed_at
        })

    return jsonify(result)

@app.route("/api/review_submission", methods=["POST"])
@token_required
def review_submission(current_user):
    if current_user["role"] != "ngo":
        return jsonify({"error": "Only NGOs can review submissions"}), 403

    data = request.json
    submission = Submission.query.get(data.get("submission_id"))
    if not submission:
        return jsonify({"error": "Submission not found"}), 404

    submission.status = data.get("status", "Pending")
    submission.reviewed_by = current_user["user_id"]
    submission.reviewed_at = datetime.utcnow()

    if submission.status == "Approved":
        volunteer = User.query.get(submission.volunteer_id)
        volunteer.points += 10
        if volunteer.points in [50, 100, 200]:
            generate_certificate(volunteer)

    db.session.commit()
    return jsonify({"message": f"Submission {submission.status}"})

# ---------------------------
# CERTIFICATE GENERATION
# ---------------------------
def generate_certificate(volunteer):
    filename = f"{CERT_DIR}/{volunteer.id}_{volunteer.points}.pdf"
    c = canvas.Canvas(filename, pagesize=letter)
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(300, 650, "SevaSetu Certificate of Appreciation")
    c.setFont("Helvetica", 18)
    c.drawCentredString(300, 600, f"Awarded to {volunteer.name}")
    c.setFont("Helvetica", 14)
    c.drawCentredString(300, 560, f"For contributing {volunteer.points} points in volunteering")
    c.drawCentredString(300, 520, f"Date: {datetime.utcnow().strftime('%Y-%m-%d')}")
    c.showPage()
    c.save()

    cert = Certificate(volunteer_id=volunteer.id, cert_path=filename)
    db.session.add(cert)
    db.session.commit()
    return filename

@app.route("/api/my_certificates", methods=["GET"])
@token_required
def my_certificates(current_user):
    if current_user["role"] != "volunteer":
        return jsonify({"error": "Only volunteers can view certificates"}), 403

    certs = Certificate.query.filter_by(volunteer_id=current_user["user_id"]).all()
    return jsonify([{
        "id": c.id,
        "path": c.cert_path,
        "generated_at": c.generated_at
    } for c in certs])

@app.route("/api/certificate/<int:cert_id>", methods=["GET"])
def download_certificate(cert_id):
    cert = Certificate.query.get(cert_id)
    if not cert:
        return jsonify({"error": "Certificate not found"}), 404
    return send_file(cert.cert_path, as_attachment=True)

# ---------------------------
# LEADERBOARD
# ---------------------------
@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    volunteers = User.query.filter_by(role="volunteer").order_by(User.points.desc()).limit(10).all()
    return jsonify([{
        "name": v.name,
        "city": v.city,
        "state": v.state,
        "points": v.points
    } for v in volunteers])

# ---------------------------
# ADMIN ROUTES
# ---------------------------
@app.route("/api/admin/verify_ngo", methods=["POST"])
@token_required
def verify_ngo(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    data = request.json
    ngo = User.query.get(data.get("ngo_id"))
    if not ngo or ngo.role != "ngo":
        return jsonify({"error": "NGO not found"}), 404

    ngo.verified = True
    db.session.commit()
    return jsonify({"message": f"NGO {ngo.name} verified"})

@app.route("/api/admin/ngos", methods=["GET"])
@token_required
def admin_ngos(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    ngos = User.query.filter_by(role="ngo").all()
    return jsonify([{
        "id": ngo.id,
        "name": ngo.name,
        "email": ngo.email,
        "city": ngo.city,
        "state": ngo.state,
        "verified": ngo.verified
    } for ngo in ngos])

@app.route("/api/admin/volunteers", methods=["GET"])
@token_required
def admin_volunteers(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    volunteers = User.query.filter_by(role="volunteer").all()
    return jsonify([{
        "id": v.id,
        "name": v.name,
        "email": v.email,
        "city": v.city,
        "state": v.state,
        "points": v.points
    } for v in volunteers])

@app.route("/api/admin/block_user", methods=["POST"])
@token_required
def block_user(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    data = request.json
    user = User.query.get(data.get("user_id"))
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.verified = False
    db.session.commit()
    return jsonify({"message": f"User {user.name} blocked"})

@app.route("/api/admin/delete_user", methods=["DELETE"])
@token_required
def delete_user(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    data = request.json
    user = User.query.get(data.get("user_id"))
    if not user:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": f"User {user.name} deleted"})

@app.route("/api/admin/export_volunteers", methods=["GET"])
@token_required
def export_volunteers(current_user):
    if current_user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403

    volunteers = User.query.filter_by(role="volunteer").all()

    si = StringIO()
    cw = csv.writer(si)
    cw.writerow(["ID", "Name", "Email", "City", "State", "Points"])
    for v in volunteers:
        cw.writerow([v.id, v.name, v.email, v.city, v.state, v.points])

    output = si.getvalue()
    return Response(
        output,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=volunteers.csv"}
    )

# ---------------------------
# TEST ROUTE
# ---------------------------
@app.route("/api/me", methods=["GET"])
@token_required
def me(current_user):
    return jsonify({"message": "Token is valid", "user": current_user})

# Run server
if __name__ == "__main__":
    app.run(debug=True)
