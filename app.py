from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
from flask_cors import CORS
import sqlite3
import json
from datetime import datetime, timedelta
import os
import requests
from threading import Thread
from functools import wraps
from dotenv import load_dotenv
import time
import io
import base64
import cloudinary
import cloudinary.uploader
from prompt_core import run_prompt_pipeline

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='.')
app.secret_key = 'iv-studio-secret-key-2026-super-secure-key'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=1)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Limit upload size to 16MB
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "DELETE", "OPTIONS"]}}, supports_credentials=True)

# Get OpenAI API Key
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Hardcoded user credentials
USER_CREDENTIALS = {
    'email': 'admin@ivinfotech.com',
    'password': 'admin123',
    'name': 'IV Infotech Admin'
}

# Database configuration
DATABASE = 'iv_studio.db'
WEBHOOK_URL = 'https://n8n.srv1010073.hstgr.cloud/webhook/iv-infotech-ai-video-gen'

# KIE.ai API configuration for Flux2 Pro Image-to-Image
KIE_API_KEY = os.getenv('KIE_API_KEY')
KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload"
KIE_CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
KIE_TASK_STATUS_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

# Cloudinary configuration
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

# Default logo and character URLs (from Cloudinary)
DEFAULT_LOGO_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770974447/mwkdoaojy5wpwzoewyb5.png"
DEFAULT_CHARACTER_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770972383/jyn46erxuogos2dlgmae.jpg"

# Authentication decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return jsonify({'error': 'Unauthorized', 'redirect': '/login.html'}), 401
        return f(*args, **kwargs)
    return decorated_function

def get_db():
    """Get database connection"""
    db = sqlite3.connect(DATABASE, check_same_thread=False)
    db.row_factory = sqlite3.Row
    return db

# Helper Functions
def download_bytes(url: str, timeout: int = 30) -> bytes:
    """Download an image URL and return raw bytes."""
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content

def cloudinary_upload_bytes(file_bytes: bytes, filename: str, folder="kie-inputs"):
    """Upload image bytes to Cloudinary and return public HTTPS URL."""
    if not (os.getenv("CLOUDINARY_CLOUD_NAME") and os.getenv("CLOUDINARY_API_KEY") and os.getenv("CLOUDINARY_API_SECRET")):
        raise RuntimeError("Cloudinary credentials missing (CLOUDINARY_CLOUD_NAME / KEY / SECRET).")
    
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=folder,
        public_id=os.path.splitext(filename)[0],
        overwrite=True,
        resource_type="image"
    )
    return result["secure_url"]

# KIE.ai Helper Functions
def kie_upload_bytes(file_bytes: bytes, filename: str, mimetype: str = "image/png", upload_path="images/user-uploads"):
    """Upload bytes to KIE.ai"""
    if not KIE_API_KEY:
        raise RuntimeError("KIE_API_KEY missing.")
    
    import io
    files = {"file": (filename, io.BytesIO(file_bytes), mimetype)}
    data = {"uploadPath": upload_path, "fileName": filename}
    headers = {"Authorization": f"Bearer {KIE_API_KEY}"}
    
    r = requests.post(KIE_UPLOAD_URL, headers=headers, files=files, data=data, timeout=60)
    r.raise_for_status()
    j = r.json()
    if not j.get("success"):
        raise RuntimeError(f"Upload failed: {j}")
    return j["data"]["downloadUrl"]

def kie_create_flux2_pro_i2i_task(prompt: str, input_urls: list, aspect_ratio="1:1", quality="medium"):
    """Create Flux2 Pro image-to-image task on KIE.ai"""
    headers = {"Authorization": f"Bearer {KIE_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": "gpt-image/1.5-image-to-image",
        "input": {
            "input_urls": input_urls,
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "quality": quality,
        },
    }
    
    r = requests.post(KIE_CREATE_TASK_URL, headers=headers, json=payload, timeout=60)
    r.raise_for_status()
    j = r.json()
    
    if j.get("code") != 200:
        raise RuntimeError(f"Task create failed: {j} | payload: {payload}")
    
    return j["data"]["taskId"]

def kie_poll_task(task_id: str, timeout_sec=240, poll_interval=3):
    """Poll KIE.ai task for completion"""
    import time
    headers = {"Authorization": f"Bearer {KIE_API_KEY}"}
    end = time.time() + timeout_sec
    
    while time.time() < end:
        r = requests.get(KIE_TASK_STATUS_URL, headers=headers, params={"taskId": task_id}, timeout=30)
        r.raise_for_status()
        j = r.json()
        data = j.get("data") or {}
        state = (data.get("state") or "").lower().strip()
        
        if state == "success":
            result_json_str = data.get("resultJson") or "{}"
            result_obj = json.loads(result_json_str)
            return result_obj.get("resultUrls") or []
        
        if state == "fail":
            raise RuntimeError(f"Generation failed: {data.get('failMsg')}")
        
        time.sleep(poll_interval)
    
    raise TimeoutError("Timed out waiting for image generation task.")

def init_db():
    """Initialize database with schema"""
    db = get_db()
    db.execute('''
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            company_service TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            has_custom_character INTEGER DEFAULT 0,
            scene_1_img TEXT,
            scene_1_vid TEXT,
            scene_2_img TEXT,
            scene_2_vid TEXT,
            error_message TEXT,
            webhook_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    db.execute('''
        CREATE TABLE IF NOT EXISTS insta_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            mode TEXT NOT NULL,
            status TEXT DEFAULT 'processing',
            primary_hex TEXT,
            secondary_hex TEXT,
            concept TEXT,
            title TEXT,
            subtitle TEXT,
            address_line TEXT,
            final_prompt TEXT,
            position TEXT,
            experience TEXT,
            location TEXT,
            post TEXT,
            error_message TEXT,
            generated_image_urls TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Migration: Add status column if it doesn't exist
    try:
        cursor = db.execute("PRAGMA table_info(insta_posts)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'status' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN status TEXT DEFAULT 'completed'")
            print("Added status column to insta_posts table")
        
        if 'error_message' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN error_message TEXT")
            print("Added error_message column to insta_posts table")
        
        if 'updated_at' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN updated_at TIMESTAMP")
            # Update existing rows with current timestamp
            db.execute("UPDATE insta_posts SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL")
            print("Added updated_at column to insta_posts table")
        
        if 'position' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN position TEXT")
            print("Added position column to insta_posts table")
        
        if 'experience' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN experience TEXT")
            print("Added experience column to insta_posts table")
        
        if 'location' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN location TEXT")
            print("Added location column to insta_posts table")
        
        if 'generated_image_urls' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN generated_image_urls TEXT")
            print("Added generated_image_urls column to insta_posts table")
        
        if 'logo_base64' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN logo_base64 LONGTEXT")
            print("Added logo_base64 column to insta_posts table")
        
        if 'character_base64' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN character_base64 LONGTEXT")
            print("Added character_base64 column to insta_posts table")
        
        if 'post' not in columns:
            db.execute("ALTER TABLE insta_posts ADD COLUMN post TEXT")
            print("Added post column to insta_posts table")
            
    except Exception as e:
        print(f"Migration error: {e}")
    
    db.commit()
    db.close()

# Initialize database on startup
init_db()

@app.route('/')
def index():
    """Serve the main HTML file or redirect to login"""
    if 'user' not in session:
        return redirect('/login.html')
    return send_from_directory('.', 'index.html')

@app.route('/api/login', methods=['POST'])
def login():
    """Login endpoint"""
    data = request.json
    email = data.get('email', '')
    password = data.get('password', '')
    
    if email == USER_CREDENTIALS['email'] and password == USER_CREDENTIALS['password']:
        session.permanent = True
        session['user'] = {
            'email': USER_CREDENTIALS['email'],
            'name': USER_CREDENTIALS['name']
        }
        return jsonify({
            'success': True,
            'user': session['user']
        })
    else:
        return jsonify({
            'success': False,
            'error': 'Invalid email or password'
        }), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    """Logout endpoint"""
    session.pop('user', None)
    return jsonify({'success': True})

@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    """Check if user is authenticated"""
    if 'user' in session:
        return jsonify({
            'authenticated': True,
            'user': session['user']
        })
    return jsonify({'authenticated': False}), 401

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

@app.route('/api/projects', methods=['GET'])
@login_required
def get_projects():
    """Get all projects"""
    db = get_db()
    cursor = db.execute('''
        SELECT * FROM projects 
        ORDER BY created_at DESC
    ''')
    projects = [dict(row) for row in cursor.fetchall()]
    db.close()
    return jsonify(projects)

@app.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    """Get single project by ID"""
    db = get_db()
    cursor = db.execute('SELECT * FROM projects WHERE id = ?', (project_id,))
    project = cursor.fetchone()
    db.close()
    
    if project:
        return jsonify(dict(project))
    return jsonify({'error': 'Project not found'}), 404

@app.route('/api/projects', methods=['POST'])
@login_required
def create_project():
    """Create new project and start video generation"""
    try:
        data = request.form
        
        # Extract form data
        title = data.get('title', 'Untitled Video')
        video_description = data.get('raw_description', '')
        company_service = data.get('company_service', '')
        has_custom_character = 1 if data.get('character_image') == 'true' else 0
        
        # Default image URLs for when user doesn't upload
        DEFAULT_LOGO_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770974447/mwkdoaojy5wpwzoewyb5.png"
        DEFAULT_CHARACTER_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770972383/jyn46erxuogos2dlgmae.jpg"
        
        # Prepare webhook data (extract from request before thread)
        webhook_data = {
            'raw_description': video_description,
            'company_service': company_service,
            'character_image': data.get('character_image', 'false')
        }
        
        # Handle file upload if present (read file data before thread)
        file_data = None
        has_custom_character = 1 if data.get('character_image') == 'true' else 0
        if 'character_image_file' in request.files:
            character_file = request.files['character_image_file']
            if character_file.filename:
                file_data = {
                    'filename': character_file.filename,
                    'content': character_file.read(),
                    'content_type': character_file.content_type
                }
        else:
            # If no file uploaded, include default character image URL in webhook data
            webhook_data['default_character_image'] = DEFAULT_CHARACTER_URL
            webhook_data['default_logo_image'] = DEFAULT_LOGO_URL
        
        # Insert into database with pending status
        db = get_db()
        cursor = db.execute('''
            INSERT INTO projects (title, description, company_service, status, has_custom_character)
            VALUES (?, ?, ?, 'pending', ?)
        ''', (title, video_description, company_service, has_custom_character))
        project_id = cursor.lastrowid
        db.commit()
        db.close()
        
        # Start background task to call webhook
        thread = Thread(target=process_video_generation, args=(project_id, webhook_data, file_data))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'project_id': project_id,
            'message': 'Video generation started'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def process_video_generation(project_id, webhook_data, file_data):
    """Background task to process video generation"""
    db = None
    try:
        # Update status to processing
        db = sqlite3.connect(DATABASE, check_same_thread=False)
        db.execute('''
            UPDATE projects 
            SET status = 'processing', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (project_id,))
        db.commit()
        db.close()
        db = None
        
        # Prepare file for webhook if present
        webhook_files = None
        if file_data:
            webhook_files = {
                'character_image_file': (
                    file_data['filename'], 
                    file_data['content'], 
                    file_data['content_type']
                )
            }
        
        # Call webhook
        response = requests.post(WEBHOOK_URL, data=webhook_data, files=webhook_files, timeout=None)
        
        if response.status_code == 200:
            result = response.json()
            
            # Handle array response
            if isinstance(result, list) and len(result) > 0:
                result = result[0]
            
            # Update database with success
            db = sqlite3.connect(DATABASE, check_same_thread=False)
            db.execute('''
                UPDATE projects 
                SET status = 'completed',
                    scene_1_img = ?,
                    scene_1_vid = ?,
                    scene_2_img = ?,
                    scene_2_vid = ?,
                    webhook_response = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (
                result.get('scene_1_img'),
                result.get('scene_1_vid'),
                result.get('scene_2_img'),
                result.get('scene_2_vid'),
                json.dumps(result),
                project_id
            ))
            db.commit()
            db.close()
            db = None
        else:
            raise Exception(f'Webhook returned status {response.status_code}')
            
    except Exception as e:
        # Update database with error
        try:
            if db:
                db.close()
            db = sqlite3.connect(DATABASE, check_same_thread=False)
            db.execute('''
                UPDATE projects 
                SET status = 'failed',
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (str(e), project_id))
            db.commit()
            db.close()
        except Exception as db_error:
            print(f'Error updating database: {db_error}')
    finally:
        if db:
            try:
                db.close()
            except:
                pass

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    """Delete a project"""
    db = get_db()
    db.execute('DELETE FROM projects WHERE id = ?', (project_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})

@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    """Get dashboard statistics"""
    db = get_db()
    
    total_videos = db.execute('SELECT COUNT(*) as count FROM projects WHERE status = "completed"').fetchone()['count']
    total_insta_posts = db.execute('SELECT COUNT(*) as count FROM insta_posts').fetchone()['count']
    custom_characters = db.execute('SELECT COUNT(*) as count FROM projects WHERE has_custom_character = 1 AND status = "completed"').fetchone()['count']
    
    db.close()
    
    return jsonify({
        'totalVideos': total_videos,
        'totalInstaPosts': total_insta_posts,
        'customCharacters': custom_characters
    })

@app.route('/api/insta-posts', methods=['GET'])
@login_required
def get_insta_posts():
    """Get all Instagram posts"""
    db = get_db()
    cursor = db.execute('''
        SELECT * FROM insta_posts 
        ORDER BY created_at DESC
    ''')
    posts = [dict(row) for row in cursor.fetchall()]
    db.close()
    return jsonify(posts)

@app.route('/api/insta-posts/<int:post_id>', methods=['GET'])
@login_required
def get_insta_post(post_id):
    """Get single Instagram post by ID"""
    db = get_db()
    cursor = db.execute('SELECT * FROM insta_posts WHERE id = ?', (post_id,))
    post = cursor.fetchone()
    db.close()
    
    if post:
        post_dict = dict(post)
        print(f"Fetching post {post_id}, generated_image_urls: {post_dict.get('generated_image_urls')}")
        return jsonify(post_dict)
    return jsonify({'error': 'Post not found'}), 404

@app.route('/api/insta-posts/<int:post_id>', methods=['DELETE'])
@login_required
def delete_insta_post(post_id):
    """Delete an Instagram post"""
    db = get_db()
    db.execute('DELETE FROM insta_posts WHERE id = ?', (post_id,))
    db.commit()
    db.close()
    return jsonify({'success': True})

@app.route('/api/insta-posts/<int:post_id>/save-images', methods=['POST'])
@login_required
def save_insta_post_images(post_id):
    """Save generated image URLs to Instagram post"""
    try:
        data = request.json
        image_urls = data.get('image_urls', [])
        
        print(f"Saving images for post {post_id}: {image_urls}")
        
        db = get_db()
        db.execute(
            'UPDATE insta_posts SET generated_image_urls = ? WHERE id = ?',
            (json.dumps(image_urls), post_id)
        )
        db.commit()
        
        # Verify the save
        cursor = db.execute('SELECT generated_image_urls FROM insta_posts WHERE id = ?', (post_id,))
        saved_data = cursor.fetchone()
        print(f"Verified saved data: {saved_data['generated_image_urls'] if saved_data else 'None'}")
        
        db.close()
        
        return jsonify({'success': True, 'message': 'Images saved successfully'})
    except Exception as e:
        print(f"Error saving images: {str(e)}")
        return jsonify({'error': str(e)}), 500

def process_insta_post_background(post_id, keyword, mode, logo_bytes, character_bytes, api_key, position="", experience="", location="", post=""):
    """Background task to process Instagram post"""
    db = None
    try:
        print(f"[Background Task] Starting processing for post {post_id}")
        
        # Run the LangChain pipeline
        result = run_prompt_pipeline(
            keyword=keyword,
            banner_mode=mode,
            logo_bytes=logo_bytes,
            character_bytes=character_bytes,
            api_key=api_key,
            position=position,
            experience=experience,
            location=location,
            post=post
        )
        
        print(f"[Background Task] Prompt generated for post {post_id}")
        
        # Upload images to Cloudinary for KIE API
        logo_url = cloudinary_upload_bytes(logo_bytes, filename="logo.png", folder="kie-inputs")
        char_url = cloudinary_upload_bytes(character_bytes, filename="character.png", folder="kie-inputs")
        
        print(f"[Background Task] Images uploaded - Logo: {logo_url}, Character: {char_url}")
        
        # Generate images using KIE API
        task_id = kie_create_flux2_pro_i2i_task(
            prompt=result.get('final_prompt'),
            input_urls=[logo_url, char_url],
            aspect_ratio="1:1",
            quality="medium"
        )
        
        print(f"[Background Task] KIE task created: {task_id}")
        
        # Poll for result
        result_urls = kie_poll_task(task_id)
        
        print(f"[Background Task] Images generated: {result_urls}")
        
        # Update database with results including generated images
        db = get_db()
        db.execute('''
            UPDATE insta_posts 
            SET status = 'completed',
                primary_hex = ?,
                secondary_hex = ?,
                concept = ?,
                title = ?,
                subtitle = ?,
                address_line = ?,
                final_prompt = ?,
                position = ?,
                experience = ?,
                location = ?,
                generated_image_urls = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            result.get('primary_hex'),
            result.get('secondary_hex'),
            result.get('concept'),
            result.get('title'),
            result.get('subtitle'),
            result.get('address_line'),
            result.get('final_prompt'),
            position,
            experience,
            location,
            json.dumps(result_urls),
            post_id
        ))
        db.commit()
        db.close()
        db = None
        
        print(f"[Background Task] Post {post_id} completed successfully!")
        
    except Exception as e:
        print(f"[Background Task] Error processing post {post_id}: {e}")
        import traceback
        traceback.print_exc()
        
        # Update database with error
        try:
            if db:
                db.close()
            db = sqlite3.connect(DATABASE, check_same_thread=False)
            db.execute('''
                UPDATE insta_posts 
                SET status = 'failed',
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (str(e), post_id))
            db.commit()
            db.close()
        except Exception as db_error:
            print(f'Error updating database: {db_error}')
    finally:
        if db:
            try:
                db.close()
            except:
                pass

@app.route('/api/generate-insta-post', methods=['POST'])
@login_required
def generate_insta_post():
    """Generate Instagram post prompt ONLY (step 1 of 2 - user can review before image generation)"""
    try:
        # Check if OpenAI API key is configured
        if not OPENAI_API_KEY:
            return jsonify({'error': 'OpenAI API key is not configured'}), 500
        
        # Get form data
        keyword = (request.form.get('keyword') or '').strip()
        mode = (request.form.get('mode') or '').strip()
        
        # Files are OPTIONAL now
        logo = request.files.get('logo')
        character = request.files.get('character')
        
        # Get hiring-specific fields
        position = (request.form.get('position') or '').strip()
        experience = (request.form.get('experience') or '').strip()
        location = (request.form.get('location') or '').strip()
        post = (request.form.get('post') or '').strip()  # Number of openings
        
        # Validate required fields
        if not keyword:
            return jsonify({'error': 'Keyword is required'}), 400
        
        if mode not in ['HIRING', 'MARKETING']:
            return jsonify({'error': 'Invalid mode. Must be HIRING or MARKETING'}), 400
        
        # Validate hiring-specific fields when mode is HIRING
        if mode == 'HIRING':
            if not position:
                return jsonify({'error': 'Position is required for HIRING mode'}), 400
            if not experience:
                return jsonify({'error': 'Experience is required for HIRING mode'}), 400
            if not location:
                return jsonify({'error': 'Location is required for HIRING mode'}), 400
            if not post:
                return jsonify({'error': 'Post (number of openings) is required for HIRING mode'}), 400
        
        # If missing uploads, download default Cloudinary images as bytes
        if logo and logo.filename:
            logo_bytes = logo.read()
            logo_used = "uploaded"
        else:
            logo_bytes = download_bytes(DEFAULT_LOGO_URL)
            logo_used = "default_url"
        
        if character and character.filename:
            character_bytes = character.read()
            character_used = "uploaded"
        else:
            character_bytes = download_bytes(DEFAULT_CHARACTER_URL)
            character_used = "default_url"
        
        print(f"Logo source: {logo_used} | Character source: {character_used}")
        
        # Convert to base64 for storage
        logo_base64 = base64.b64encode(logo_bytes).decode('utf-8')
        character_base64 = base64.b64encode(character_bytes).decode('utf-8')
        
        # Run prompt generation immediately (not in background)
        print(f"[Insta Post] Generating prompt for keyword: {keyword}")
        print(f"[Insta Post] Banner mode: {mode}")
        print(f"[Insta Post] Starting prompt pipeline...")
        
        result = None
        try:
            result = run_prompt_pipeline(
                keyword=keyword,
                banner_mode=mode,
                logo_bytes=logo_bytes,
                character_bytes=character_bytes,
                api_key=OPENAI_API_KEY,
                position=position,
                experience=experience,
                location=location,
                post=post
            )
            print(f"[Insta Post] Prompt pipeline completed successfully")
            print(f"[Insta Post] Result keys: {result.keys() if result else 'None'}")
        except ValueError as ve:
            print(f"[ERROR] Prompt validation failed: {str(ve)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Prompt validation failed: {str(ve)}'}), 400
        except Exception as e:
            print(f"[ERROR] Prompt pipeline failed: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Prompt generation failed: {str(e)}'}), 500
        
        # Ensure result is valid before proceeding
        if not result:
            print(f"[ERROR] Prompt pipeline returned empty result")
            return jsonify({'error': 'Prompt generation returned empty result'}), 500
        
        # Create record with prompt results (status='pending_image')
        try:
            db = get_db()
            cursor = db.execute('''
                INSERT INTO insta_posts (
                    keyword, mode, status, position, experience, location, post,
                    logo_base64, character_base64,
                    primary_hex, secondary_hex, concept, title, subtitle, address_line, final_prompt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                keyword, 
                mode, 
                'pending_image',  # status
                position, 
                experience, 
                location, 
                post,
                logo_base64, 
                character_base64,
                result.get('primary_hex'),
                result.get('secondary_hex'),
                result.get('concept'),
                result.get('title'),
                result.get('subtitle'),
                result.get('address_line'),
                result.get('final_prompt')
            ))
            db.commit()
            post_id = cursor.lastrowid
            print(f"[Insta Post] Created post #{post_id} with status='pending_image'")
            
        except Exception as db_error:
            print(f"[ERROR] Database insert failed: {str(db_error)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to save post: {str(db_error)}'}), 500
        
        print(f"[Insta Post] Prompt generated successfully for post {post_id}")
        
        # Return response with prompt data for user to review
        return jsonify({
            'id': post_id,
            'status': 'pending_image',
            'keyword': keyword,
            'mode': mode,
            'position': position,
            'experience': experience,
            'location': location,
            'post': post,
            'primary_hex': result.get('primary_hex'),
            'secondary_hex': result.get('secondary_hex'),
            'concept': result.get('concept'),
            'title': result.get('title'),
            'subtitle': result.get('subtitle'),
            'address_line': result.get('address_line'),
            'final_prompt': result.get('final_prompt'),
            '_logo_source': logo_used,
            '_character_source': character_used
        }), 200
            
    except Exception as e:
        print(f'Error creating Instagram post: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-insta-image/<int:post_id>', methods=['POST'])
@login_required
def generate_insta_image(post_id):
    """Generate images for an Instagram post (step 2 of 2)"""
    try:
        # Allow user to optionally update the prompt
        updated_prompt = request.json.get('final_prompt') if request.is_json else None
        
        # Retrieve post from database
        db = get_db()
        cursor = db.execute('''
            SELECT logo_base64, character_base64, final_prompt, status 
            FROM insta_posts WHERE id = ?
        ''', (post_id,))
        row = cursor.fetchone()
        db.close()
        
        if not row:
            return jsonify({'error': 'Post not found'}), 404
        
        logo_b64, character_b64, original_prompt, status = row
        
        # If prompt was updated, use the new one
        final_prompt = updated_prompt if updated_prompt else original_prompt
        
        if not final_prompt:
            return jsonify({'error': 'No prompt available for this post'}), 400
        
        # Decode images from base64
        logo_bytes = base64.b64decode(logo_b64)
        character_bytes = base64.b64decode(character_b64)
        
        # Update status to processing
        db = get_db()
        db.execute('UPDATE insta_posts SET status = ?, final_prompt = ? WHERE id = ?', 
                   ('processing', final_prompt, post_id))
        db.commit()
        db.close()
        
        print(f"[Insta Image] Starting image generation for post {post_id}")
        
        # Start background image generation
        thread = Thread(
            target=generate_insta_image_background,
            args=(post_id, final_prompt, logo_bytes, character_bytes)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'id': post_id,
            'status': 'processing',
            'message': 'Image generation started'
        }), 200
        
    except Exception as e:
        print(f'Error starting image generation: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def generate_insta_image_background(post_id, final_prompt, logo_bytes, character_bytes):
    """Background task to generate images for Instagram post"""
    db = None
    try:
        print(f"[Background Image] Starting for post {post_id}")
        
        # Upload images to Cloudinary for KIE API
        logo_url = cloudinary_upload_bytes(logo_bytes, filename="logo.png", folder="kie-inputs")
        char_url = cloudinary_upload_bytes(character_bytes, filename="character.png", folder="kie-inputs")
        
        print(f"[Background Image] Images uploaded - Logo: {logo_url}, Character: {char_url}")
        
        # Generate images using KIE API
        task_id = kie_create_flux2_pro_i2i_task(
            prompt=final_prompt,
            input_urls=[logo_url, char_url],
            aspect_ratio="1:1",
            quality="medium"
        )
        
        print(f"[Background Image] KIE task created: {task_id}")
        
        # Poll for result
        result_urls = kie_poll_task(task_id)
        
        print(f"[Background Image] Images generated: {result_urls}")
        
        # Update database with generated images
        db = get_db()
        db.execute('''
            UPDATE insta_posts 
            SET status = 'completed',
                generated_image_urls = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (json.dumps(result_urls), post_id))
        db.commit()
        db.close()
        db = None
        
        print(f"[Background Image] Post {post_id} completed successfully!")
        
    except Exception as e:
        print(f"[Background Image] Error for post {post_id}: {e}")
        import traceback
        traceback.print_exc()
        
        # Update database with error
        try:
            if db:
                db.close()
            db = sqlite3.connect(DATABASE, check_same_thread=False)
            db.execute('''
                UPDATE insta_posts 
                SET status = 'failed',
                    error_message = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (str(e), post_id))
            db.commit()
            db.close()
        except Exception as db_error:
            print(f'Error updating database: {db_error}')
    finally:
        if db:
            try:
                db.close()
            except:
                pass

@app.route('/api/generate-prompt', methods=['POST'])
@login_required
def generate_prompt():
    """Generate prompt/concept ONLY without creating images"""
    try:
        print("✅ HIT /api/generate-prompt")
        print("Content-Type:", request.content_type)
        print("FORM:", request.form.to_dict())
        print("FILES:", list(request.files.keys()))
        
        if not OPENAI_API_KEY:
            return jsonify({'error': 'OpenAI API key is not configured'}), 500
        
        keyword = (request.form.get('keyword') or '').strip()
        banner_mode = (request.form.get('mode') or '').strip().upper()
        
        if not keyword:
            return jsonify({'error': 'keyword is required'}), 400
        
        if banner_mode not in ['HIRING', 'MARKETING']:
            return jsonify({'error': 'Invalid mode. Must be HIRING or MARKETING'}), 400
        
        # Files are OPTIONAL now
        logo_file = request.files.get('logo') or request.files.get('logo[]')
        character_file = request.files.get('character') or request.files.get('character[]')
        
        # Hiring-only fields
        post = (request.form.get('post') or '').strip()
        position = (request.form.get('position') or '').strip()
        experience = (request.form.get('experience') or '').strip()
        location = (request.form.get('location') or '').strip()
        
        if banner_mode == 'HIRING':
            if not position:
                return jsonify({'error': 'position is required in HIRING mode'}), 400
            if not experience:
                return jsonify({'error': 'experience is required in HIRING mode'}), 400
            if not location:
                return jsonify({'error': 'location is required in HIRING mode'}), 400
            if not post:
                return jsonify({'error': 'post is required in HIRING mode'}), 400
        
        # If missing uploads, download default Cloudinary images as bytes
        if logo_file and logo_file.filename:
            logo_bytes = logo_file.read()
            logo_used = "uploaded"
        else:
            logo_bytes = download_bytes(DEFAULT_LOGO_URL)
            logo_used = "default_url"
        
        if character_file and character_file.filename:
            character_bytes = character_file.read()
            character_used = "uploaded"
        else:
            character_bytes = download_bytes(DEFAULT_CHARACTER_URL)
            character_used = "default_url"
        
        print(f"Logo source: {logo_used} | Character source: {character_used}")
        
        result = run_prompt_pipeline(
            keyword=keyword,
            banner_mode=banner_mode,
            logo_bytes=logo_bytes,
            character_bytes=character_bytes,
            api_key=OPENAI_API_KEY,
            post=post,
            position=position,
            experience=experience,
            location=location,
        )
        
        # Add debug info in response
        result["_logo_source"] = logo_used
        result["_character_source"] = character_used
        return jsonify(result), 200
        
    except Exception as e:
        print(f'Error in /api/generate-prompt: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Server error generating prompt', 'details': str(e)}), 500

@app.route('/api/generate-image', methods=['POST'])
@login_required
def generate_image():
    """Generate image using Flux2 Pro image-to-image model from KIE.ai"""
    try:
        if not KIE_API_KEY:
            return jsonify({'error': 'KIE_API_KEY is not configured'}), 500
        
        final_prompt = (request.form.get('final_prompt') or '').strip()
        if not final_prompt:
            return jsonify({'error': 'final_prompt is required'}), 400
        
        post_id = request.form.get('post_id')
        logo_bytes = None
        character_bytes = None
        logo_source = "unknown"
        char_source = "unknown"
        
        # If post_id is provided, retrieve stored images from database
        if post_id:
            try:
                db = get_db()
                cursor = db.execute('SELECT logo_base64, character_base64 FROM insta_posts WHERE id = ?', (post_id,))
                row = cursor.fetchone()
                db.close()
                
                if not row or not row[0] or not row[1]:
                    return jsonify({'error': 'Post or stored images not found'}), 404
                
                # Decode base64 to bytes
                logo_bytes = base64.b64decode(row[0])
                character_bytes = base64.b64decode(row[1])
                logo_source = "database"
                char_source = "database"
            except Exception as e:
                return jsonify({'error': f'Failed to retrieve stored images: {str(e)}'}), 400
        else:
            # Get images from request files (OPTIONAL now)
            logo_file = request.files.get('logo')
            character_file = request.files.get('character')
            
            # If missing uploads, use defaults from Cloudinary
            if logo_file and logo_file.filename:
                logo_bytes = logo_file.read()
                logo_source = "uploaded"
            else:
                logo_bytes = download_bytes(DEFAULT_LOGO_URL)
                logo_source = "default_url"
            
            if character_file and character_file.filename:
                character_bytes = character_file.read()
                char_source = "uploaded"
            else:
                character_bytes = download_bytes(DEFAULT_CHARACTER_URL)
                char_source = "default_url"
        
        aspect_ratio = (request.form.get('aspect_ratio') or '1:1').strip()
        quality = (request.form.get('quality') or 'medium').strip()
        
        # Upload to Cloudinary first, then use URLs for KIE.ai
        if post_id:
            logo_url = cloudinary_upload_bytes(logo_bytes, filename="logo.png", folder="kie-inputs")
            char_url = cloudinary_upload_bytes(character_bytes, filename="character.png", folder="kie-inputs")
        else:
            logo_filename = logo_file.filename if (logo_file and logo_file.filename) else "logo.png"
            char_filename = character_file.filename if (character_file and character_file.filename) else "character.png"
            
            logo_url = cloudinary_upload_bytes(logo_bytes, filename=logo_filename, folder="kie-inputs")
            char_url = cloudinary_upload_bytes(character_bytes, filename=char_filename, folder="kie-inputs")
        
        print(f"✅ Using logo_url: {logo_url} | source: {logo_source}")
        print(f"✅ Using char_url: {char_url} | source: {char_source}")
        
        # Create task
        task_id = kie_create_flux2_pro_i2i_task(
            prompt=final_prompt,
            input_urls=[logo_url, char_url],
            aspect_ratio=aspect_ratio,
            quality=quality
        )
        
        # Poll for result
        result_urls = kie_poll_task(task_id)
        
        print("✅ Generation successful! Result URLs:", result_urls)
        return jsonify({
            'task_id': task_id,
            'image_urls': result_urls,  # Frontend expects 'image_urls'
            'final_prompt': final_prompt,
            'status': 'completed',
            'logo_url_used': logo_url,
            'character_url_used': char_url,
            '_logo_source': logo_source,
            '_character_source': char_source
        }), 200
        
    except TimeoutError as e:
        print(f'Image generation timeout: {e}')
        return jsonify({'error': 'Image generation timed out', 'details': str(e)}), 500
    except Exception as e:
        print(f'Error in /api/generate-image: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Server error generating image', 'details': str(e)}), 500

if __name__ == '__main__':
    print('🚀 IV Studio AI Video Generator - Starting Server...')
    print('📊 Database: SQLite')
    print('🌐 Access at: http://localhost:5003')
    app.run(debug=True, port=5003, host='0.0.0.0')
