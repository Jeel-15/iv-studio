// ==================== CONFIGURATION ====================
const API_BASE_URL = window.location.origin + '/api';

// ==================== AUTHENTICATION ====================
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/check-auth`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/login.html';
            return false;
        }
        
        const data = await response.json();
        if (!data.authenticated) {
            window.location.href = '/login.html';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        window.location.href = '/login.html';
    }
}

const DEFAULT_COMPANY_SERVICE = `IV Infotech is a leading IT company in India, delivering scalable digital solutions globally. We specialize in custom mobile app development, responsive website design, and enterprise software that turn complex ideas into digital success. As a top-rated IT company in Mehsana, we empower startups and global enterprises across various industries with innovation-driven tech solutions to elevate their digital presence and stay ahead in today's competitive tech market.

Custom Mobile Application Development
Custom Website & Software Development
CRM & ERP Custom Software Development
E-Commerce Solution
Digital marketing
UI UX Design
Web Hosting Services`;

// ==================== UI NOTIFICATIONS ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                ${type === 'success' ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                ${type === 'error' ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' : ''}
                ${type === 'warning' ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' : ''}
                ${type === 'info' ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' : ''}
            </div>
            <div class="notification-message">${message}</div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ==================== DOM ELEMENTS ====================
const videoForm = document.getElementById('videoForm');
const characterImageInput = document.getElementById('characterImage');
const uploadArea = document.getElementById('uploadArea');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImage');
const companyServiceTextarea = document.getElementById('companyService');

const formWrapper = document.getElementById('formWrapper');
const loadingWrapper = document.getElementById('loadingWrapper');
const resultsWrapper = document.getElementById('resultsWrapper');
const fullViewModal = document.getElementById('fullViewModal');

let selectedFile = null;
let currentProject = null;
let statusCheckInterval = null;
let progressInterval = null;

// Will be initialized in DOMContentLoaded
let navItems;
let viewSections;

function switchView(viewName) {
    navItems.forEach(item => {
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    viewSections.forEach(section => {
        if (section.id === `${viewName}View`) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });

    // Update URL slug
    const slug = viewName === 'dashboard' ? '' : viewName;
    history.pushState({ view: viewName }, '', slug ? `#${slug}` : '#');

    // Load data when switching to specific views
    if (viewName === 'dashboard') {
        loadDashboard();
    } else if (viewName === 'projects') {
        loadProjectsList();
    } else if (viewName === 'create') {
        resetCreateForm();
    } else if (viewName === 'instaPost') {
        loadInstaPostsList();
    } else if (viewName === 'createInstaPost') {
        resetInstaForm();
    }
}

function resetCreateForm() {
    showForm();
    if (videoForm) videoForm.reset();
    if (companyServiceTextarea) companyServiceTextarea.value = DEFAULT_COMPANY_SERVICE;
    selectedFile = null;
    if (uploadArea) uploadArea.style.display = 'flex';
    if (imagePreview) imagePreview.style.display = 'none';
}

// ==================== API FUNCTIONS ====================
async function fetchProjects() {
    try {
        console.log('Fetching projects from:', `${API_BASE_URL}/projects`);
        const response = await fetch(`${API_BASE_URL}/projects`);
        console.log('Response status:', response.status);
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        console.log('Projects loaded:', data.length);
        return data;
    } catch (error) {
        console.error('Error fetching projects:', error);
        showNotification('Failed to load projects: ' + error.message, 'error');
        return [];
    }
}

async function fetchProject(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${id}`);
        if (!response.ok) throw new Error('Project not found');
        return await response.json();
    } catch (error) {
        showNotification('Failed to load project: ' + error.message, 'error');
        return null;
    }
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/stats`);
        if (!response.ok) throw new Error('Failed to fetch stats');
        return await response.json();
    } catch (error) {
        console.error('Stats error:', error);
        return { totalVideos: 0, totalScenes: 0, customCharacters: 0 };
    }
}

async function deleteProjectAPI(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete project');
        showNotification('Project deleted successfully', 'success');
        return true;
    } catch (error) {
        showNotification('Failed to delete project: ' + error.message, 'error');
        return false;
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    console.log('📊 Loading Dashboard...');
    const stats = await fetchStats();
    console.log('Stats:', stats);

    document.getElementById('totalVideos').textContent = stats.totalVideos;
    document.getElementById('totalInstaPosts').textContent = stats.totalInstaPosts || 0;
    document.getElementById('customCharacters').textContent = stats.customCharacters;

    const lastUpdated = new Date().toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
    document.getElementById('lastCreated').textContent = lastUpdated;

    const projects = await fetchProjects();
    console.log('Projects for dashboard:', projects);
    console.log('Projects length:', projects.length);
    const recentProjectsContainer = document.getElementById('recentProjects');

    if (projects.length === 0) {
        console.log('No projects found, showing empty state');
        recentProjectsContainer.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--color-grey);">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 20px;"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/></svg>
                <p style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">No projects yet</p>
                <p style="font-size: 14px; opacity: 0.7;">Create your first AI video to get started</p>
            </div>
        `;
        return;
    }

    console.log('Rendering recent projects...');
    const recentProjects = projects.slice(0, 4);
    recentProjectsContainer.innerHTML = recentProjects.map(project => createProjectCard(project, true)).join('');
    console.log('Dashboard loaded successfully with', recentProjects.length, 'projects');
}

// ==================== PROJECTS LIST ====================
async function loadProjectsList() {
    console.log('📁 Loading Projects List...');
    const projects = await fetchProjects();
    console.log('Projects for list:', projects);
    console.log('Projects count:', projects.length);
    
    const projectsGrid = document.getElementById('projectsList');
    console.log('projectsList element:', projectsGrid);

    if (projects.length === 0) {
        console.log('No projects, showing empty state');
        projectsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 80px 20px; color: var(--color-grey);">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 20px;"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">No projects found</p>
                <p style="font-size: 15px; opacity: 0.7; margin-bottom: 24px;">Start creating amazing AI videos</p>
                <button onclick="switchView('create')" style="background: var(--color-primary); color: var(--color-black); border: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 15px;">
                    Create New Project
                </button>
            </div>
        `;
        return;
    }

    console.log('Rendering all projects...');
    
    // Pagination settings
    const projectsPerPage = 10;
    let currentPage = 1;
    const totalPages = Math.ceil(projects.length / projectsPerPage);
    
    function renderProjects(page) {
        const startIndex = (page - 1) * projectsPerPage;
        const endIndex = startIndex + projectsPerPage;
        const projectsToShow = projects.slice(startIndex, endIndex);
        
        let html = projectsToShow.map(project => createProjectCard(project, false)).join('');
        
        // Add pagination controls if more than 1 page
        if (totalPages > 1) {
            html += `
                <div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 40px; padding: 20px;">
                    <button onclick="loadProjectsPage(${page - 1})" 
                        ${page === 1 ? 'disabled' : ''}
                        style="padding: 10px 16px; background: ${page === 1 ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 215, 0, 0.1)'}; color: ${page === 1 ? 'var(--color-grey)' : 'var(--color-primary)'}; border: 2px solid ${page === 1 ? 'var(--color-grey-dark)' : 'var(--color-primary)'}; border-radius: 8px; font-weight: 700; cursor: ${page === 1 ? 'not-allowed' : 'pointer'}; transition: all 0.3s;">
                        ← Previous
                    </button>
                    <div style="display: flex; gap: 8px;">
            `;
            
            // Page numbers
            for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
                    html += `
                        <button onclick="loadProjectsPage(${i})"
                            style="width: 40px; height: 40px; background: ${i === page ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' : 'rgba(255, 215, 0, 0.1)'}; color: ${i === page ? 'var(--color-black)' : 'var(--color-primary)'}; border: 2px solid var(--color-primary); border-radius: 8px; font-weight: 700; cursor: pointer; transition: all 0.3s; font-size: 14px;">
                            ${i}
                        </button>
                    `;
                } else if (i === page - 2 || i === page + 2) {
                    html += '<span style="color: var(--color-grey); padding: 0 8px;">...</span>';
                }
            }
            
            html += `
                    </div>
                    <button onclick="loadProjectsPage(${page + 1})"
                        ${page === totalPages ? 'disabled' : ''}
                        style="padding: 10px 16px; background: ${page === totalPages ? 'rgba(128, 128, 128, 0.3)' : 'rgba(255, 215, 0, 0.1)'}; color: ${page === totalPages ? 'var(--color-grey)' : 'var(--color-primary)'}; border: 2px solid ${page === totalPages ? 'var(--color-grey-dark)' : 'var(--color-primary)'}; border-radius: 8px; font-weight: 700; cursor: ${page === totalPages ? 'not-allowed' : 'pointer'}; transition: all 0.3s;">
                        Next →
                    </button>
                    <div style="margin-left: 20px; color: var(--color-grey); font-size: 14px;">
                        Page ${page} of ${totalPages} (${projects.length} total projects)
                    </div>
                </div>
            `;
        }
        
        projectsGrid.innerHTML = html;
    }
    
    // Store for global access
    window.loadProjectsPage = function(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderProjects(currentPage);
        // Scroll to top of projects list
        projectsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    
    renderProjects(currentPage);
    console.log('Projects list loaded successfully with pagination');
}

function createProjectCard(project, isRecent) {
    if (!project || !project.id) {
        console.error('Invalid project data:', project);
        return '';
    }
    
    const date = new Date(project.created_at).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
    });

    const statusBadge = project.status === 'completed' ? 'Completed' :
                       project.status === 'processing' ? 'Processing...' :
                       project.status === 'pending' ? 'Pending...' :
                       'Failed';

    // Different visual states based on status
    let imageContent = '';
    
    if (project.status === 'completed' && project.scene_1_img) {
        // Show actual image for completed projects
        imageContent = `<img src="${project.scene_1_img}" alt="${project.title}" class="project-featured-image" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else if (project.status === 'processing' || project.status === 'pending') {
        // Show animated processing indicator
        imageContent = `
            <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);">
                <div style="width: 80px; height: 80px; border: 4px solid #333; border-top-color: #FFD700; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
                <div style="color: #FFD700; font-size: 18px; font-weight: 700; margin-bottom: 8px;">${statusBadge}</div>
                <div style="color: #808080; font-size: 14px; text-align: center; padding: 0 20px;">Generating your AI video...</div>
            </div>
        `;
    } else {
        // Show error icon for failed status
        imageContent = `
            <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: linear-gradient(135deg, #1a1a1a 0%, #2d1a1a 100%);">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>
                <div style="color: #ef4444; font-size: 18px; font-weight: 700; margin-bottom: 8px;">Generation Failed</div>
                <div style="color: #808080; font-size: 13px; text-align: center; padding: 0 20px; max-width: 240px; line-height: 1.5;">${project.error_message || 'An error occurred during video generation'}</div>
            </div>
        `;
    }

    return `
        <div class="project-card">
            <div class="project-featured-image-container" style="width: 280px; height: 500px; overflow: hidden; background: #000;">
                ${imageContent}
            </div>
            <div class="project-content">
                <div class="project-header">
                    <h3 class="project-title">${project.title}</h3>
                    <div class="project-info">
                        <span class="project-date">${date}</span>
                        <span class="project-badge">${statusBadge}</span>
                    </div>
                </div>
                
                <p class="project-description">${project.description}</p>
                
                <div class="project-actions">
                    ${project.status === 'completed' ? `
                        <div class="project-actions-row">
                            <button class="project-btn" onclick="viewProject(${project.id})">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                <span>View</span>
                            </button>
                            <button class="project-btn" onclick="downloadProject(${project.id})">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                <span>Download</span>
                            </button>
                        </div>
                        ${!isRecent ? `
                            <button class="project-btn" onclick="deleteProject(${project.id})">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                <span>Delete</span>
                            </button>
                        ` : ''}
                    ` : project.status === 'processing' || project.status === 'pending' ? `
                        <button class="project-btn" onclick="viewProject(${project.id})">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            <span>View Status</span>
                        </button>
                    ` : `
                        <div class="project-actions-row">
                            <button class="project-btn" onclick="viewProject(${project.id})">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                <span>View Error</span>
                            </button>
                            ${!isRecent ? `
                                <button class="project-btn" onclick="deleteProject(${project.id})">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                    <span>Delete</span>
                                </button>
                            ` : ''}
                        </div>
                    `}
                </div>
            </div>
        </div>
    `;
}

async function viewProject(id) {
    const project = await fetchProject(id);
    if (!project) return;

    currentProject = project;

    if (project.status === 'completed') {
        displayProjectView(project);
    } else if (project.status === 'processing' || project.status === 'pending') {
        showProjectLoading(project);
    } else if (project.status === 'failed') {
        displayProjectView(project);
    }
}

function displayProjectView(project) {
    // Update view title and subtitle
    const titleEl = document.getElementById('viewProjectTitle');
    const subtitleEl = document.getElementById('viewProjectSubtitle');
    const contentEl = document.getElementById('viewProjectContent');
    
    if (titleEl) titleEl.textContent = project.title;
    if (subtitleEl) {
        const date = new Date(project.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        subtitleEl.textContent = `Created on ${date} • ${project.status.toUpperCase()}`;
    }
    
    // Display content based on status
    if (project.status === 'completed' && contentEl) {
        contentEl.innerHTML = `
            <div class="results-wrapper" style="display: block;">
                <div class="results-header">
                    <h2 class="section-title-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 8px; stroke: var(--color-primary);"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>
                        Generated Video Scenes
                    </h2>
                    <button class="btn-text" onclick="downloadAllScenes()">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Download All</span>
                    </button>
                </div>
                ${generateScenesHTML(project)}
            </div>
        `;
    } else if (project.status === 'failed' && contentEl) {
        contentEl.innerHTML = `
            <div style="padding: 60px 20px; text-align: center;">
                <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: rgba(239, 68, 68, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                </div>
                <h2 style="color: #ef4444; font-size: 24px; margin-bottom: 12px;">Generation Failed</h2>
                <p style="color: var(--color-grey); font-size: 14px; max-width: 500px; margin: 0 auto;">${project.error_message || 'An error occurred during video generation'}</p>
            </div>
        `;
    }
    
    switchView('viewProject');
}

function generateScenesHTML(project) {
    return `
        <div class="results-grid">
            <!-- Scene 1 -->
            <div class="scene-card">
                <div class="scene-header">
                    <h3 class="scene-title">Scene 1</h3>
                    <span class="scene-badge">Problem/Intro</span>
                </div>
                <div class="media-container">
                    <div class="media-item">
                        <div class="media-label">Image</div>
                        <img src="${project.scene_1_img}" alt="Scene 1 Image" class="scene-image">
                        <button class="view-btn" onclick="viewMediaURL('${project.scene_1_img}', 'image')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>View Full</span>
                        </button>
                    </div>
                    <div class="media-item">
                        <div class="media-label">Video</div>
                        <video src="${project.scene_1_vid}" class="scene-video" controls></video>
                        <button class="view-btn" onclick="viewMediaURL('${project.scene_1_vid}', 'video')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="2" y1="2" x2="22" y2="22"/><line x1="2" y1="22" x2="22" y2="2"/></svg>
                            <span>Full Screen</span>
                        </button>
                    </div>
                </div>
                <div class="download-actions">
                    <button class="download-btn" onclick="downloadMediaURL('${project.scene_1_img}', 'scene1-image.png')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Image</span>
                    </button>
                    <button class="download-btn" onclick="downloadMediaURL('${project.scene_1_vid}', 'scene1-video.mp4')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Video</span>
                    </button>
                </div>
            </div>
            <!-- Scene 2 -->
            <div class="scene-card">
                <div class="scene-header">
                    <h3 class="scene-title">Scene 2</h3>
                    <span class="scene-badge scene-badge-success">Solution/Growth</span>
                </div>
                <div class="media-container">
                    <div class="media-item">
                        <div class="media-label">Image</div>
                        <img src="${project.scene_2_img}" alt="Scene 2 Image" class="scene-image">
                        <button class="view-btn" onclick="viewMediaURL('${project.scene_2_img}', 'image')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>View Full</span>
                        </button>
                    </div>
                    <div class="media-item">
                        <div class="media-label">Video</div>
                        <video src="${project.scene_2_vid}" class="scene-video" controls></video>
                        <button class="view-btn" onclick="viewMediaURL('${project.scene_2_vid}', 'video')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="2" y1="2" x2="22" y2="22"/><line x1="2" y1="22" x2="22" y2="2"/></svg>
                            <span>Full Screen</span>
                        </button>
                    </div>
                </div>
                <div class="download-actions">
                    <button class="download-btn" onclick="downloadMediaURL('${project.scene_2_img}', 'scene2-image.png')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Image</span>
                    </button>
                    <button class="download-btn" onclick="downloadMediaURL('${project.scene_2_vid}', 'scene2-video.mp4')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>Video</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function viewMediaURL(url, type) {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = '';

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Full View';
        modalBody.appendChild(img);
    } else if (type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        modalBody.appendChild(video);
    }

    fullViewModal.classList.add('active');
}

function downloadMediaURL(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
}

function downloadAllScenes() {
    if (!currentProject || currentProject.status !== 'completed') return;
    
    showNotification('Starting downloads...', 'info');
    
    downloadMediaURL(currentProject.scene_1_img, 'scene1-image.png');
    setTimeout(() => downloadMediaURL(currentProject.scene_1_vid, 'scene1-video.mp4'), 500);
    setTimeout(() => downloadMediaURL(currentProject.scene_2_img, 'scene2-image.png'), 1000);
    setTimeout(() => downloadMediaURL(currentProject.scene_2_vid, 'scene2-video.mp4'), 1500);
}

async function downloadProject(id) {
    const project = await fetchProject(id);
    if (!project || project.status !== 'completed') return;

    showNotification('Starting downloads...', 'info');
    
    downloadMedia(null, `scene1-image.png`, project.scene_1_img);
    setTimeout(() => downloadMedia(null, `scene1-video.mp4`, project.scene_1_vid), 500);
    setTimeout(() => downloadMedia(null, `scene2-image.png`, project.scene_2_img), 1000);
    setTimeout(() => downloadMedia(null, `scene2-video.mp4`, project.scene_2_vid), 1500);
}

let projectToDelete = null;

async function deleteProject(id) {
    console.log('deleteProject called with id:', id);
    console.log('Type of id:', typeof id);
    
    if (!id || id === null || id === undefined) {
        console.error('Invalid project ID for deletion:', id);
        showNotification('Invalid project ID', 'error');
        return;
    }
    
    projectToDelete = id;
    console.log('projectToDelete set to:', projectToDelete);
    
    // Update modal for project deletion
    document.getElementById('deleteModalTitle').textContent = 'Delete Project?';
    document.getElementById('deleteModalMessage').textContent = 'Are you sure you want to delete this project? This action cannot be undone and all project data will be permanently removed.';
    document.getElementById('deleteConfirmBtnText').textContent = 'Delete Project';
    
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.style.display = 'flex';
    setTimeout(() => deleteModal.classList.add('active'), 10);
}

function closeDeleteModal() {
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.classList.remove('active');
    setTimeout(() => deleteModal.style.display = 'none', 300);
    projectToDelete = null;
    deleteInstaPostId = null;
}

async function confirmDelete() {
    console.log('confirmDelete called, projectToDelete:', projectToDelete);
    
    // Check if it's an Instagram post deletion
    if (deleteInstaPostId !== null) {
        await confirmDeleteInstaPost();
        return;
    }
    
    if (!projectToDelete) {
        console.error('No project ID to delete');
        showNotification('No project selected for deletion', 'error');
        return;
    }
    
    // Store ID in local variable before modal closes and variable resets
    const idToDelete = projectToDelete;
    console.log('Local idToDelete:', idToDelete);
    
    closeDeleteModal();
    showNotification('Deleting project...', 'info');
    
    console.log('Calling deleteProjectAPI with id:', idToDelete);
    const success = await deleteProjectAPI(idToDelete);
    if (success) {
        loadProjectsList();
        loadDashboard();
    }
    
    projectToDelete = null;
}

function showProjectLoading(project) {
    switchView('create');
    showLoading();
    startProgressAnimation();
    checkProjectStatus(project.id);
}

async function checkProjectStatus(projectId) {
    if (statusCheckInterval) clearInterval(statusCheckInterval);

    statusCheckInterval = setInterval(async () => {
        const project = await fetchProject(projectId);
        
        if (project.status === 'completed') {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
            completeProgress();
            
            showNotification('🎉 Video generation completed successfully!', 'success');
            
            setTimeout(() => {
                displayResults(project);
                loadDashboard();
                loadProjectsList();
            }, 2000);
        } else if (project.status === 'failed') {
            clearInterval(statusCheckInterval);
            statusCheckInterval = null;
            clearInterval(progressInterval);
            progressInterval = null;
            showForm();
            showNotification(`Video generation failed: ${project.error_message}`, 'error');
            loadDashboard();
            loadProjectsList();
        }
    }, 3000);
}

// ==================== FILE UPLOAD ====================
characterImageInput.addEventListener('change', handleFileSelect);

function handleFileSelect(e) {
    const file = e.target.files[0];

    if (file) {
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showNotification('Image size should be less than 10MB', 'error');
            return;
        }

        selectedFile = file;

        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            uploadArea.style.display = 'none';
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--color-primary)';
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--color-grey-dark)';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--color-grey-dark)';

    const file = e.dataTransfer.files[0];
    if (file) {
        characterImageInput.files = e.dataTransfer.files;
        handleFileSelect({ target: { files: [file] } });
    }
});

removeImageBtn.addEventListener('click', () => {
    selectedFile = null;
    characterImageInput.value = '';
    uploadArea.style.display = 'flex';
    imagePreview.style.display = 'none';
    previewImg.src = '';
});

// ==================== FORM SUBMISSION ====================
videoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const videoTitle = document.getElementById('videoTitle').value;
    const videoDescription = document.getElementById('videoDescription').value;
    const companyService = companyServiceTextarea.value;

    const formData = new FormData();
    formData.append('title', videoTitle);
    formData.append('raw_description', videoDescription);
    formData.append('company_service', companyService);
    formData.append('character_image', selectedFile ? 'true' : 'false');

    if (selectedFile) {
        formData.append('character_image_file', selectedFile);
    }

    showLoading();
    startProgressAnimation();

    try {
        const response = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        if (data.success) {
            showNotification('✨ Video generation started! Tracking progress...', 'success');
            checkProjectStatus(data.project_id);
        } else {
            throw new Error(data.error || 'Failed to start generation');
        }

    } catch (error) {
        clearInterval(progressInterval);
        showForm();
        showNotification('❌ Failed to generate video: ' + error.message, 'error');
    }
});

// ==================== VIEW STATES ====================
function showForm() {
    formWrapper.style.display = 'block';
    loadingWrapper.style.display = 'none';
    resultsWrapper.style.display = 'none';
    window.onbeforeunload = null;
}

function showLoading() {
    formWrapper.style.display = 'none';
    loadingWrapper.style.display = 'block';
    resultsWrapper.style.display = 'none';
    window.onbeforeunload = () => "Video generation in progress!";
}

function showResults() {
    formWrapper.style.display = 'none';
    loadingWrapper.style.display = 'none';
    resultsWrapper.style.display = 'block';
    window.onbeforeunload = null;
}

// ==================== PROGRESS ANIMATION ====================
let currentProgress = 0;
let targetProgress = 0;
const progressStages = [
    { progress: 15, label: 'Analyzing video concept...', status: 'AI analyzing requirements', eta: '8-10 min' },
    { progress: 30, label: 'Generating scene layouts...', status: 'Creating visual composition', eta: '6-8 min' },
    { progress: 45, label: 'Rendering character animations...', status: 'AI crafting character movements', eta: '5-7 min' },
    { progress: 60, label: 'Processing video frames...', status: 'Rendering high-quality frames', eta: '4-6 min' },
    { progress: 75, label: 'Adding visual effects...', status: 'Applying AI enhancements', eta: '3-4 min' },
    { progress: 88, label: 'Encoding final video...', status: 'Finalizing video output', eta: '1-2 min' },
    { progress: 95, label: 'Almost ready...', status: 'Final optimizations', eta: '< 1 min' }
];

let currentStageIndex = 0;

function startProgressAnimation() {
    currentProgress = 0;
    targetProgress = 0;
    currentStageIndex = 0;
    
    updateProgressUI(0, progressStages[0].label, progressStages[0].status, progressStages[0].eta);
    
    progressInterval = setInterval(() => {
        if (currentStageIndex < progressStages.length) {
            const stage = progressStages[currentStageIndex];
            targetProgress = stage.progress;
            
            if (currentProgress < targetProgress) {
                currentProgress += 0.5;
                updateProgressUI(
                    Math.floor(currentProgress),
                    stage.label,
                    stage.status,
                    stage.eta
                );
            } else {
                setTimeout(() => currentStageIndex++, 3000);
            }
        }
    }, 200);
}

function updateProgressUI(percentage, label, status, eta) {
    const percentageEl = document.getElementById('progressPercentage');
    const statusEl = document.getElementById('progressStatus');
    const progressBar = document.getElementById('progressBar');
    const progressLabel = document.getElementById('progressLabel');
    const progressETA = document.getElementById('progressETA');
    const timelineTime = document.getElementById('timelineTime');
    const editorStatus = document.getElementById('editorStatus');
    
    if (percentageEl) percentageEl.textContent = `${percentage}%`;
    if (statusEl) statusEl.textContent = status;
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressLabel) progressLabel.textContent = label;
    if (progressETA) progressETA.textContent = `ETA: ${eta}`;
    if (editorStatus) editorStatus.textContent = status;
    
    const videoClip = document.getElementById('videoClip');
    const audioClip = document.getElementById('audioClip');
    const effectsClip = document.getElementById('effectsClip');
    
    if (videoClip) videoClip.style.width = `${Math.min(percentage, 100)}%`;
    if (audioClip) audioClip.style.width = `${Math.max(0, percentage - 10)}%`;
    if (effectsClip) effectsClip.style.width = `${Math.max(0, percentage - 20)}%`;
    
    if (timelineTime) {
        const seconds = Math.floor((percentage / 100) * 30);
        const secs = seconds % 60;
        timelineTime.textContent = `00:${String(secs).padStart(2, '0')} / 00:30`;
    }
}

function completeProgress() {
    clearInterval(progressInterval);
    currentProgress = 100;
    updateProgressUI(100, 'Video generation complete!', 'Ready for preview', 'Complete');
}

// ==================== DISPLAY RESULTS ====================
function displayResults(data) {
    showResults();

    const scene1Img = document.getElementById('scene1Img');
    const scene1Vid = document.getElementById('scene1Vid');
    scene1Img.src = data.scene_1_img;
    scene1Vid.src = data.scene_1_vid;

    const scene2Img = document.getElementById('scene2Img');
    const scene2Vid = document.getElementById('scene2Vid');
    scene2Img.src = data.scene_2_img;
    scene2Vid.src = data.scene_2_vid;

    scene1Img.dataset.url = data.scene_1_img;
    scene1Vid.dataset.url = data.scene_1_vid;
    scene2Img.dataset.url = data.scene_2_img;
    scene2Vid.dataset.url = data.scene_2_vid;

    resultsWrapper.scrollIntoView({ behavior: 'smooth' });
}

// ==================== MEDIA VIEWER ====================
function viewMedia(elementId, type) {
    const element = document.getElementById(elementId);
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = '';

    if (type === 'image') {
        const img = document.createElement('img');
        img.src = element.src;
        img.alt = 'Full View';
        modalBody.appendChild(img);
    } else if (type === 'video') {
        const video = document.createElement('video');
        video.src = element.src;
        video.controls = true;
        video.autoplay = true;
        modalBody.appendChild(video);
    }

    fullViewModal.classList.add('active');
}

function closeModal() {
    fullViewModal.classList.remove('active');
    const modalBody = document.getElementById('modalBody');
    const video = modalBody.querySelector('video');
    if (video) video.pause();
    modalBody.innerHTML = '';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullViewModal.classList.contains('active')) {
        closeModal();
    }
});

// ==================== DOWNLOAD ====================
async function downloadMedia(elementId, filename, directUrl = null) {
    let url = directUrl || document.getElementById(elementId).dataset.url;

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        window.open(url, '_blank');
    }
}

// ==================== CREATE NEW VIDEO ====================
function createNewVideo() {
    videoForm.reset();
    selectedFile = null;
    uploadArea.style.display = 'flex';
    imagePreview.style.display = 'none';
    previewImg.src = '';
    currentProject = null;
    companyServiceTextarea.value = DEFAULT_COMPANY_SERVICE;
    showForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== FULLSCREEN EDITOR ====================
const expandCompanyDetailsBtn = document.getElementById('expandCompanyDetails');

if (expandCompanyDetailsBtn) {
    expandCompanyDetailsBtn.addEventListener('click', openFullscreenEditor);
}

function openFullscreenEditor() {
    let modal = document.getElementById('fullscreenEditorModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'fullscreenEditorModal';
        modal.className = 'fullscreen-editor';
        modal.innerHTML = `
            <div class="fullscreen-header">
                <div class="fullscreen-title">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Company Service Details
                </div>
                <button class="fullscreen-close" onclick="closeFullscreenEditor()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Close
                </button>
            </div>
            <textarea class="fullscreen-textarea" id="fullscreenTextarea"></textarea>
        `;
        document.body.appendChild(modal);
    }

    const fullscreenTextarea = modal.querySelector('#fullscreenTextarea');
    fullscreenTextarea.value = companyServiceTextarea.value;
    modal.classList.add('active');
    fullscreenTextarea.focus();

    fullscreenTextarea.addEventListener('input', () => {
        companyServiceTextarea.value = fullscreenTextarea.value;
    });

    document.addEventListener('keydown', handleEscapeKey);
}

function closeFullscreenEditor() {
    const modal = document.getElementById('fullscreenEditorModal');
    if (modal) {
        modal.classList.remove('active');
        document.removeEventListener('keydown', handleEscapeKey);
    }
}

function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        closeFullscreenEditor();
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✨ IV Studio AI Video CRM initialized with Flask Backend');
    
    // Check authentication first
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        return; // Will redirect to login
    }
    
    // Initialize mobile menu
    initMobileMenu();
    
    // Initialize navigation
    navItems = document.querySelectorAll('.nav-item');
    viewSections = document.querySelectorAll('.view-section');
    
    console.log('Found nav items:', navItems.length);
    console.log('Found view sections:', viewSections.length);
    
    // Setup navigation click handlers
    navItems.forEach(item => {
        console.log('Setting up nav item:', item.dataset.view);
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewName = item.dataset.view;
            console.log('Nav clicked:', viewName);
            switchView(viewName);
            // Close mobile menu after navigation
            closeMobileMenu();
        });
    });
    
    companyServiceTextarea.value = DEFAULT_COMPANY_SERVICE;
    
    // Load dashboard data
    await loadDashboard();
    
    // Check for active/processing projects on page load
    const projects = await fetchProjects();
    const activeProject = projects.find(p => p.status === 'processing' || p.status === 'pending');
    
    if (activeProject) {
        // If there's an active project, show it
        console.log('Found active project:', activeProject.id);
        showProjectLoading(activeProject);
    } else {
        // Otherwise show form
        showForm();
    }
    
    // Also load projects list if user is on projects view
    const projectsView = document.getElementById('projectsView');
    if (projectsView && projectsView.classList.contains('active')) {
        loadProjectsList();
    }
    
    // Handle URL hash on page load
    handleURLHash();
});

// ==================== MOBILE MENU ====================
function initMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const mainWrapper = document.querySelector('.main-wrapper');
    
    // Create hamburger button on view headers
    const viewHeaders = document.querySelectorAll('.view-header');
    viewHeaders.forEach(header => {
        header.style.cursor = 'pointer';
        header.addEventListener('click', (e) => {
            // Only trigger on the ::before pseudo element area or if clicking header directly
            const rect = header.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX < 60) { // Hamburger area
                toggleMobileMenu();
            }
        });
    });
    
    // Close menu when clicking overlay (body::after)
    document.body.addEventListener('click', (e) => {
        if (document.body.classList.contains('sidebar-open')) {
            const sidebar = document.querySelector('.sidebar');
            if (!sidebar.contains(e.target) && !e.target.closest('.view-header')) {
                closeMobileMenu();
            }
        }
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768) {
                closeMobileMenu();
            }
        }, 250);
    });
}

function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const body = document.body;
    
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        body.classList.toggle('sidebar-open');
    }
}

function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const body = document.body;
    
    sidebar.classList.remove('mobile-open');
    body.classList.remove('sidebar-open');
}

// Handle URL hash navigation
function handleURLHash() {
    const hash = window.location.hash.substring(1); // Remove #
    if (hash) {
        // Check if it's a viewInstaPost with ID (e.g., viewInstaPost/20)
        if (hash.startsWith('viewInstaPost/')) {
            const postId = hash.split('/')[1];
            if (postId) {
                // Pass false to not update history since we're loading from URL
                viewInstaPost(parseInt(postId), false);
                return;
            }
        }
        switchView(hash);
    }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
        const viewName = event.state.view;
        
        // Handle viewInstaPost with postId
        if (viewName === 'viewInstaPost' && event.state.postId) {
            viewInstaPost(event.state.postId);
            return;
        }
        
        // Update active nav item
        navItems.forEach(item => {
            if (item.dataset.view === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Update active view section
        viewSections.forEach(section => {
            if (section.id === `${viewName}View`) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
        
        // Load data for specific views
        if (viewName === 'dashboard') {
            loadDashboard();
        } else if (viewName === 'projects') {
            loadProjectsList();
        } else if (viewName === 'create') {
            resetCreateForm();
        } else if (viewName === 'instaPost') {
            loadInstaPostsList();
        } else if (viewName === 'createInstaPost') {
            resetInstaForm();
        }
    }});

// ==================== INSTAGRAM POST FUNCTIONALITY ====================

// Store current post data and files for image generation
let currentInstaPost = null;
let currentLogoFile = null;
let currentCharacterFile = null;
let currentViewingPost = null; // Store post being viewed for image generation

// Toggle hiring fields visibility based on selected mode
function toggleHiringFields() {
    const mode = document.getElementById('instaMode').value;
    const hiringFieldsContainer = document.getElementById('hiringFieldsContainer');
    const positionInput = document.getElementById('instaPosition');
    const experienceInput = document.getElementById('instaExperience');
    const locationInput = document.getElementById('instaLocation');
    
    if (mode === 'HIRING') {
        // Show hiring fields
        if (hiringFieldsContainer) {
            hiringFieldsContainer.style.display = 'block';
        }
        // Make fields required
        if (positionInput) positionInput.required = true;
        if (experienceInput) experienceInput.required = true;
        if (locationInput) locationInput.required = true;
    } else {
        // Hide hiring fields
        if (hiringFieldsContainer) {
            hiringFieldsContainer.style.display = 'none';
        }
        // Remove required attribute
        if (positionInput) positionInput.required = false;
        if (experienceInput) experienceInput.required = false;
        if (locationInput) locationInput.required = false;
        // Clear values
        if (positionInput) positionInput.value = '';
        if (experienceInput) experienceInput.value = '';
        if (locationInput) locationInput.value = '';
    }
}

// Generate banner image using Flux2 Pro
async function generateInstaImage() {
    const generateImageBtn = document.getElementById('generateImageBtn');
    const originalBtnText = generateImageBtn.querySelector('.btn-text').textContent;
    
    try {
        // Validate we have the required data
        if (!currentInstaPost || !currentInstaPost.final_prompt) {
            showNotification('No prompt available. Generate a post first!', 'error');
            return;
        }
        
        // Disable button and show loading state
        generateImageBtn.disabled = true;
        generateImageBtn.querySelector('.btn-text').textContent = 'Generating Image...';
        
        showNotification('Starting banner image generation with Flux2 Pro...', 'info');
        
        // Prepare FormData
        const formData = new FormData();
        formData.append('final_prompt', currentInstaPost.final_prompt);
        
        // Add files if available, otherwise backend will use defaults
        if (currentLogoFile) {
            formData.append('logo', currentLogoFile);
        }
        if (currentCharacterFile) {
            formData.append('character', currentCharacterFile);
        }
        
        // Show info if using defaults
        if (!currentLogoFile || !currentCharacterFile) {
            showNotification('Using default logo and character for image generation...', 'info');
        }
        
        formData.append('aspect_ratio', '1:1');
        formData.append('resolution', '1K');
        
        // Call backend API
        const response = await fetch(`${API_BASE_URL}/generate-image`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate image');
        }
        
        const result = await response.json();
        
        if (result.image_urls && Array.isArray(result.image_urls)) {
            // Display generated images
            displayGeneratedImages(result.image_urls);
            showNotification('Banner images generated successfully!', 'success');
        } else {
            throw new Error('No images in response');
        }
        
    } catch (error) {
        console.error('Error generating image:', error);
        showNotification(error.message || 'Failed to generate banner image', 'error');
    } finally {
        generateImageBtn.disabled = false;
        generateImageBtn.querySelector('.btn-text').textContent = originalBtnText;
    }
}

// Display generated images in the results
function displayGeneratedImages(imageUrls) {
    // Create image container if it doesn't exist
    let imageContainer = document.getElementById('generatedImagesContainer');
    if (!imageContainer) {
        imageContainer = document.createElement('div');
        imageContainer.id = 'generatedImagesContainer';
        imageContainer.style.cssText = 'margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;';
        
        const resultsDiv = document.getElementById('instaResults');
        const resultsActions = resultsDiv.querySelector('.results-actions');
        resultsDiv.insertBefore(imageContainer, resultsActions);
    }
    
    // Clear existing images
    imageContainer.innerHTML = '';
    
    // Add new images
    imageUrls.forEach((url, index) => {
        const imageCard = document.createElement('div');
        imageCard.style.cssText = 'background: rgba(255, 255, 255, 0.05); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);';
        
        imageCard.innerHTML = `
            <img src="${url}" alt="Generated Banner ${index + 1}" style="width: 100%; height: auto; display: block;">
            <div style="padding: 12px;">
                <a href="${url}" target="_blank" class="submit-btn" style="width: 100%; text-align: center; display: inline-block; text-decoration: none; padding: 10px;">
                    <span class="btn-text">Download Image</span>
                </a>
            </div>
        `;
        
        imageContainer.appendChild(imageCard);
    });
}

// Show loader in banner preview
function showImageGenerationLoader() {
    const previewContainer = document.getElementById('bannerPreviewContainer');
    if (!previewContainer) return;
    
    previewContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: 16px;">
            <div style="width: 50px; height: 50px; border: 3px solid rgba(255, 215, 0, 0.2); border-top-color: #FFD700; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="color: #A0A0A0; font-size: 14px; text-align: center;">Processing your request...</p>
        </div>
    `;
    previewContainer.style.border = '1px solid rgba(255, 215, 0, 0.3)';
}

// Generate images for the post being viewed
async function generateImageForViewingPost() {
    if (!currentViewingPost) {
        showNotification('Post data not available. Please refresh the page.', 'error');
        return;
    }
    
    // Get edited prompt from hidden input
    const editedPrompt = document.getElementById('editableFinalPrompt')?.value;
    if (!editedPrompt || !editedPrompt.trim()) {
        showNotification('Please enter a prompt for image generation.', 'error');
        return;
    }
    
    const btn = document.getElementById('previewGenerateBtn') || document.getElementById('viewGenerateImageBtn');
    if (!btn) {
        showNotification('Generate button not found', 'error');
        return;
    }
    
    const originalBtnText = btn.querySelector('.btn-text').textContent;
    
    try {
        btn.disabled = true;
        btn.querySelector('.btn-text').textContent = 'Generating...';
        
        // Show loader in banner preview
        showImageGenerationLoader();
        
        showNotification('Generating banner images using edited prompt...', 'info');
        
        // Use stored images from the post (pass post_id instead of files)
        const formData = new FormData();
        formData.append('final_prompt', editedPrompt.trim()); // Use edited prompt
        formData.append('post_id', currentViewingPost.id); // Use post_id to retrieve stored images
        formData.append('aspect_ratio', '1:1');
        formData.append('resolution', '1K');
        
        const response = await fetch(`${API_BASE_URL}/generate-image`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate image');
        }
        
        const result = await response.json();
        
        if (result.image_urls && Array.isArray(result.image_urls)) {
            // Save images to database
            await saveGeneratedImages(currentViewingPost.id, result.image_urls);
            // Display images in the post view
            displayImagesInPostView(result.image_urls);
            showNotification('Banner images generated and saved successfully!', 'success');
        } else {
            throw new Error('No images in response');
        }
        
    } catch (error) {
        console.error('Error generating image:', error);
        showNotification(error.message || 'Failed to generate banner image', 'error');
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').textContent = originalBtnText;
    }
}

// Save generated images to database
async function saveGeneratedImages(postId, imageUrls) {
    console.log('Saving images to database:', { postId, imageUrls });
    try {
        const response = await fetch(`${API_BASE_URL}/insta-posts/${postId}/save-images`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image_urls: imageUrls }),
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to save images');
        }
        
        const result = await response.json();
        console.log('Images saved successfully:', result);
        return result;
    } catch (error) {
        console.error('Error saving images:', error);
        // Don't throw - images are displayed even if save fails
    }
}

// Open fullscreen image viewer
function openFullscreenImageViewer(imageUrl) {
    const modal = document.createElement('div');
    modal.id = 'imageViewerModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        animation: fadeIn 0.3s ease-out;
    `;
    
    modal.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <!-- Close Button -->
            <button onclick="closeImageViewer()" style="position: absolute; top: 20px; right: 20px; width: 44px; height: 44px; background: rgba(255, 215, 0, 0.2); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 50%; color: #FFD700; cursor: pointer; font-size: 24px; transition: all 0.2s; z-index: 10002; display: flex; align-items: center; justify-content: center;" onmouseover="this.style.background='rgba(255, 215, 0, 0.3)'" onmouseout="this.style.background='rgba(255, 215, 0, 0.2)'">×</button>
            
            <!-- Image Container -->
            <div style="max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
                <img src="${imageUrl}" alt="Full View" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 10px;">
            </div>
            
            <!-- Download Button at Bottom -->
            <div style="position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);">
                <a href="${imageUrl}" download="banner.jpg" style="padding: 14px 32px; background: linear-gradient(135deg, #FFD700, #FFC500); border: none; border-radius: 8px; color: #1a1a1a; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;" onmouseover="this.style.transform='scale(1.03) translateX(-50%)'" onmouseout="this.style.transform='scale(1) translateX(-50%)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Full Image
                </a>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => modal.remove(), 300);
    }
}

// Display images in the post view (new preview layout)
function displayImagesInPostView(imageUrls) {
    console.log('Displaying images in post view:', imageUrls);
    
    const previewContainer = document.getElementById('bannerPreviewContainer');
    const generateBtn = document.getElementById('previewGenerateBtn');
    
    if (!previewContainer) {
        console.error('Banner preview container not found');
        return;
    }
    
    if (!imageUrls || imageUrls.length === 0) {
        return;
    }
    
    // Use the first generated image
    const imageUrl = imageUrls[0];
    
    // Replace the empty state with the image
    previewContainer.style.border = '1px solid rgba(255, 215, 0, 0.3)';
    previewContainer.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%;">
            <img src="${imageUrl}" alt="Generated Banner" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">
        </div>
    `;
    
    // Replace generate button with view/download buttons
    if (generateBtn) {
        generateBtn.outerHTML = `
            <div style="display: flex; gap: 12px; margin-top: 16px;">
                <button onclick="openFullscreenImageViewer('${imageUrl}')" style="flex: 1; padding: 12px 20px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; color: #93c5fd; text-decoration: none; font-size: 14px; font-weight: 600; text-align: center; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;" onmouseover="this.style.background='rgba(59, 130, 246, 0.25)'" onmouseout="this.style.background='rgba(59, 130, 246, 0.15)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View
                </button>
                <a href="${imageUrl}" download="banner.jpg" style="flex: 1; padding: 12px 20px; background: linear-gradient(135deg, #FFD700, #FFC500); border: none; border-radius: 8px; color: #1a1a1a; text-decoration: none; font-size: 14px; font-weight: 700; text-align: center; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                </a>
            </div>
        `;
    }
}

// Initialize Instagram post functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeInstaPost();
});

function initializeInstaPost() {
    // Initialize field visibility on page load
    toggleHiringFields();
    
    // Logo upload preview
    const instaLogoInput = document.getElementById('instaLogo');
    const logoUploadArea = document.getElementById('logoUploadArea');
    const logoPreview = document.getElementById('logoPreview');
    const logoPreviewImg = document.getElementById('logoPreviewImg');
    const removeLogo = document.getElementById('removeLogo');
    
    if (instaLogoInput) {
        instaLogoInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                currentLogoFile = file; // Store for image generation
                const reader = new FileReader();
                reader.onload = function(e) {
                    logoPreviewImg.src = e.target.result;
                    logoUploadArea.style.display = 'none';
                    logoPreview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        });
        
        removeLogo.addEventListener('click', function(e) {
            e.preventDefault();
            instaLogoInput.value = '';
            currentLogoFile = null;
            logoPreviewImg.src = '';
            logoUploadArea.style.display = 'flex';
            logoPreview.style.display = 'none';
        });
    }
    
    // Character upload preview
    const instaCharacterInput = document.getElementById('instaCharacter');
    const characterUploadArea = document.getElementById('characterUploadArea');
    const characterPreview = document.getElementById('characterPreview');
    const characterPreviewImg = document.getElementById('characterPreviewImg');
    const removeCharacter = document.getElementById('removeCharacter');
    
    if (instaCharacterInput) {
        instaCharacterInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                currentCharacterFile = file; // Store for image generation
                const reader = new FileReader();
                reader.onload = function(e) {
                    characterPreviewImg.src = e.target.result;
                    characterUploadArea.style.display = 'none';
                    characterPreview.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        });
        
        removeCharacter.addEventListener('click', function(e) {
            e.preventDefault();
            instaCharacterInput.value = '';
            currentCharacterFile = null;
            characterPreviewImg.src = '';
            characterUploadArea.style.display = 'flex';
            characterPreview.style.display = 'none';
        });
    }
    
    // Instagram Post Form Submission
    const instaPostForm = document.getElementById('instaPostForm');
    if (instaPostForm) {
        instaPostForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const keyword = document.getElementById('instaKeyword').value;
            const mode = document.getElementById('instaMode').value;
            const logoFile = document.getElementById('instaLogo').files[0];
            const characterFile = document.getElementById('instaCharacter').files[0];
            
            // Basic validation - only keyword and mode are required
            if (!keyword || !mode) {
                showNotification('Please fill all required fields', 'error');
                return;
            }
            
            // Validate hiring fields if mode is HIRING
            if (mode === 'HIRING') {
                const position = document.getElementById('instaPosition').value;
                const experience = document.getElementById('instaExperience').value;
                const location = document.getElementById('instaLocation').value;
                const post = document.getElementById('instaPost').value;
                
                if (!position || !experience || !location || !post) {
                    showNotification('Please fill all hiring fields', 'error');
                    return;
                }
            }
            
            // Prepare FormData
            const formData = new FormData();
            formData.append('keyword', keyword);
            formData.append('mode', mode);
            
            // Add files if uploaded, otherwise backend will use defaults
            if (logoFile) {
                formData.append('logo', logoFile);
            }
            if (characterFile) {
                formData.append('character', characterFile);
            }
            
            // Add hiring fields if mode is HIRING
            if (mode === 'HIRING') {
                const position = document.getElementById('instaPosition').value;
                const experience = document.getElementById('instaExperience').value;
                const location = document.getElementById('instaLocation').value;
                const post = document.getElementById('instaPost').value;
                formData.append('position', position);
                formData.append('experience', experience);
                formData.append('location', location);
                formData.append('post', post);
            }
            
            // Update button state
            const submitBtn = document.getElementById('instaSubmitBtn');
            const originalBtnText = submitBtn.querySelector('.btn-text').textContent;
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text').textContent = 'Generating...';
            
            // Show loading overlay on form
            const loadingOverlay = document.getElementById('instaFormLoadingOverlay');
            loadingOverlay.style.display = 'flex';
            
            // Show info if using defaults
            if (!logoFile || !characterFile) {
                showNotification('No files uploaded. Using default logo and character...', 'info');
            }
            
            try {
                showNotification('Starting Instagram post generation...', 'info');
                
                // Call backend API
                const response = await fetch(`${API_BASE_URL}/generate-insta-post`, {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to generate post');
                }
                
                const result = await response.json();
                
                // Hide loading overlay
                loadingOverlay.style.display = 'none';
                
                // Reset the form
                this.reset();
                resetInstaForm();
                
                // Show success message and redirect
                showNotification('Prompt generated successfully! Redirecting to Instagram Posts...', 'success');
                
                // Redirect after a short delay
                setTimeout(() => {
                    switchView('instaPost');
                    loadInstaPostsList();
                }, 1000);
                
                // Poll for post completion in background
                pollForPostCompletion(result.id);
                
            } catch (error) {
                console.error('Error generating Instagram post:', error);
                showNotification(error.message || 'Failed to generate Instagram post', 'error');
                
                // Hide loading overlay on error
                loadingOverlay.style.display = 'none';
            } finally {
                submitBtn.disabled = false;
                submitBtn.querySelector('.btn-text').textContent = originalBtnText;
            }
        });
    }
}

function displayInstaResults(data) {
    // This function is no longer used - posts are shown in the list
    // Keeping for backward compatibility
    console.log('Post generated:', data);
}

// Poll for post completion and display results
async function pollForPostCompletion(postId, maxAttempts = 45, interval = 2000) {
    let attempts = 0;
    let pollInterval = null;
    let promptGenerated = false;
    
    return new Promise((resolve, reject) => {
        pollInterval = setInterval(async () => {
            attempts++;
            
            try {
                const response = await fetch(`${API_BASE_URL}/insta-posts/${postId}`, {
                    credentials: 'include'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch post status');
                }
                
                const post = await response.json();
                
                // Stop polling once prompt is generated (status = pending_image)
                if (post.status === 'pending_image') {
                    if (!promptGenerated) {
                        promptGenerated = true;
                        clearInterval(pollInterval);
                        
                        // Reload posts list to show the new post with prompt
                        setTimeout(() => {
                            loadInstaPostsList();
                        }, 500);
                        
                        showNotification('Prompt generated! Click on the post to generate the image.', 'success');
                        resolve(post);
                    }
                    return;
                }
                
                // If completed (including image), stop polling
                if (post.status === 'completed') {
                    clearInterval(pollInterval);
                    
                    // Store post data for image generation
                    currentInstaPost = post;
                    
                    // Reload posts list to show updated status
                    const postsView = document.getElementById('instaPostView');
                    if (postsView && postsView.classList.contains('active')) {
                        loadInstaPostsList();
                    }
                    
                    showNotification('Post and image generation completed!', 'success');
                    resolve(post);
                    
                } else if (post.status === 'failed' || post.status === 'error') {
                    clearInterval(pollInterval);
                    showNotification(`Post generation failed: ${post.error || 'Unknown error'}`, 'error');
                    reject(new Error(`Post generation failed: ${post.error || 'Unknown error'}`));
                    
                } else if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    console.error(`Polling stopped after ${maxAttempts} attempts`);
                    showNotification('Polling stopped. Post generation taking longer than expected.', 'warning');
                    resolve(post);
                }
                
            } catch (error) {
                clearInterval(pollInterval);
                console.error('Error polling post status:', error);
            }
        }, interval);
        
        // Safety timeout after 2 minutes
        setTimeout(() => {
            if (pollInterval) {
                clearInterval(pollInterval);
                console.error('Polling safety timeout after 2 minutes');
            }
        }, maxAttempts * interval + 5000);
    });
}

// Display generated post results in the UI
function displayGeneratedPost(post) {
    // Set mode
    const resultMode = post.mode || 'MARKETING';
    
    // Display basic fields
    document.getElementById('resultTitle').textContent = post.title || '';
    document.getElementById('resultSubtitle').textContent = post.subtitle || '';
    document.getElementById('resultConcept').textContent = post.concept || '';
    document.getElementById('resultAddress').textContent = post.address_line || '';
    document.getElementById('resultPrompt').textContent = post.final_prompt || '';
    
    // Display colors if available
    if (post.primary_hex) {
        document.getElementById('primaryColorBox').style.backgroundColor = post.primary_hex;
        document.getElementById('resultPrimaryHex').textContent = post.primary_hex;
    }
    
    if (post.secondary_hex) {
        document.getElementById('secondaryColorBox').style.backgroundColor = post.secondary_hex;
        document.getElementById('resultSecondaryHex').textContent = post.secondary_hex;
    }
    
    // Display or hide hiring fields based on mode
    const resultPositionCard = document.getElementById('resultPositionCard');
    const resultExperienceCard = document.getElementById('resultExperienceCard');
    const resultLocationCard = document.getElementById('resultLocationCard');
    
    if (resultMode === 'HIRING') {
        document.getElementById('resultPosition').textContent = post.position || '';
        document.getElementById('resultExperience').textContent = post.experience || '';
        document.getElementById('resultLocation').textContent = post.location || '';
        
        if (resultPositionCard) resultPositionCard.style.display = 'block';
        if (resultExperienceCard) resultExperienceCard.style.display = 'block';
        if (resultLocationCard) resultLocationCard.style.display = 'block';
    } else {
        if (resultPositionCard) resultPositionCard.style.display = 'none';
        if (resultExperienceCard) resultExperienceCard.style.display = 'none';
        if (resultLocationCard) resultLocationCard.style.display = 'none';
    }
}

// ==================== INSTAGRAM POST POLLING ====================

let instaPostPollingInterval = null;
let instaPostsSignature = '';

function startInstaPostPolling() {
    // Clear any existing interval
    stopInstaPostPolling();
    
    // Check immediately
    checkInstaPostsStatus();
    
    // Then check every 3 seconds
    instaPostPollingInterval = setInterval(checkInstaPostsStatus, 3000);
}

function stopInstaPostPolling() {
    if (instaPostPollingInterval) {
        clearInterval(instaPostPollingInterval);
        instaPostPollingInterval = null;
    }
}

async function checkInstaPostsStatus() {
    try {
        const posts = await fetchInstaPosts();
        const processingPosts = posts.filter(p => p.status === 'processing');
        const signature = posts.map(p => `${p.id}:${p.status}:${p.updated_at || ''}`).join('|');
        const signatureChanged = signature !== instaPostsSignature;
        
        if (signatureChanged) {
            instaPostsSignature = signature;
        }
        
        if (processingPosts.length === 0) {
            // No more processing posts, stop polling
            stopInstaPostPolling();
        }
        
        // Reload the list only when something changed
        const instaPostView = document.getElementById('instaPostView');
        if (instaPostView && instaPostView.classList.contains('active') && signatureChanged) {
            loadInstaPostsList();
        }
        
        // Update dashboard stats only when changes occur or processing finished
        if (signatureChanged || processingPosts.length === 0) {
            loadDashboard();
        }
        
    } catch (error) {
        console.error('Error checking post status:', error);
    }
}


function resetInstaForm() {
    // Reset form
    const instaPostForm = document.getElementById('instaPostForm');
    if (instaPostForm) {
        instaPostForm.reset();
    }
    
    // Reset file previews
    const logoPreviewImg = document.getElementById('logoPreviewImg');
    const logoUploadArea = document.getElementById('logoUploadArea');
    const logoPreview = document.getElementById('logoPreview');
    
    if (logoPreviewImg) {
        logoPreviewImg.src = '';
        if (logoUploadArea) logoUploadArea.style.display = 'flex';
        if (logoPreview) logoPreview.style.display = 'none';
    }
    
    const characterPreviewImg = document.getElementById('characterPreviewImg');
    const characterUploadArea = document.getElementById('characterUploadArea');
    const characterPreview = document.getElementById('characterPreview');
    
    if (characterPreviewImg) {
        characterPreviewImg.src = '';
        if (characterUploadArea) characterUploadArea.style.display = 'flex';
        if (characterPreview) characterPreview.style.display = 'none';
    }
    
    // Hide results and show form
    const resultsDiv = document.getElementById('instaResults');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    
    const formDiv = document.getElementById('instaPostForm');
    if (formDiv) {
        formDiv.style.display = 'block';
    }
}

// ==================== INSTAGRAM POSTS LIST & VIEW ====================

async function fetchInstaPosts() {
    try {
        const response = await fetch(`${API_BASE_URL}/insta-posts`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch posts');
        return await response.json();
    } catch (error) {
        console.error('Error fetching Instagram posts:', error);
        showNotification('Failed to load Instagram posts', 'error');
        return [];
    }
}

async function fetchInstaPost(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/insta-posts/${id}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch post');
        return await response.json();
    } catch (error) {
        console.error('Error fetching Instagram post:', error);
        showNotification('Failed to load Instagram post', 'error');
        return null;
    }
}

async function deleteInstaPostAPI(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/insta-posts/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to delete post');
        showNotification('Post deleted successfully', 'success');
        return true;
    } catch (error) {
        showNotification('Failed to delete post: ' + error.message, 'error');
        return false;
    }
}

async function loadInstaPostsList() {
    console.log('📸 Loading Instagram Posts List...');
    const posts = await fetchInstaPosts();
    console.log('Posts:', posts);
    
    const postsGrid = document.getElementById('instaPostsList');
    
    if (posts.length === 0) {
        postsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 80px 20px; color: var(--color-grey);">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.3; margin-bottom: 20px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                <p style="font-size: 20px; font-weight: 600; margin-bottom: 12px;">No Instagram posts found</p>
                <p style="font-size: 15px; opacity: 0.7; margin-bottom: 24px;">Start creating AI-powered Instagram posts</p>
                <button onclick="switchView('createInstaPost')" style="background: var(--color-primary); color: var(--color-black); border: none; padding: 14px 28px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 15px;">
                    Create New Post
                </button>
            </div>
        `;
        return;
    }
    
    postsGrid.innerHTML = posts.map(post => createInstaPostCard(post)).join('');

    // Bind click handlers to completed cards only
    const instaCards = postsGrid.querySelectorAll('.insta-post-card');
    instaCards.forEach(card => {
        const status = (card.dataset.status || '').toLowerCase();
        if (status === 'processing' || status === 'failed') return;
        card.addEventListener('click', () => {
            const postId = Number(card.dataset.postId);
            if (!Number.isNaN(postId)) {
                viewInstaPost(postId);
            }
        });
    });
    
    // Check if there are processing posts and start polling
    const processingPosts = posts.filter(p => p.status === 'processing');
    if (processingPosts.length > 0) {
        startInstaPostPolling();
    }
}

function createInstaPostCard(post) {
    const date = new Date(post.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    
    const modeBadge = post.mode === 'HIRING' 
        ? '<span style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.25)); color: #22c55e; padding: 6px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid rgba(34, 197, 94, 0.3);">HIRING</span>'
        : '<span style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.25)); color: #3b82f6; padding: 6px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid rgba(59, 130, 246, 0.3);">MARKETING</span>';
    
    const isProcessing = post.status === 'processing';
    const isFailed = post.status === 'failed';
    const isCompleted = !isProcessing && !isFailed; // Not processing or failed = completed
    const title = post.title || post.keyword;
    const subtitle = post.subtitle || (isProcessing ? 'Generating content...' : (isFailed ? 'Generation failed' : ''));
    
    // Get colors - use defaults for processing/failed posts
    const primaryColor = post.primary_hex || '#FFD700';
    const secondaryColor = post.secondary_hex || '#FF8C00';
    
    // Processing/Failed specific styling
    const cursorStyle = isCompleted ? 'pointer' : 'default';
    const opacityStyle = isProcessing || isFailed ? 'opacity: 0.8;' : '';
    
    return `
        <div class="insta-post-card ${isProcessing ? 'is-processing' : (isFailed ? 'is-failed' : 'is-completed')}" data-post-id="${post.id}" data-status="${post.status || ''}" style="
            background: linear-gradient(145deg, rgba(30, 30, 35, 0.6), rgba(20, 20, 25, 0.8));
            border: 1px solid rgba(255, 215, 0, 0.15);
            border-radius: 16px;
            padding: 0;
            cursor: ${cursorStyle};
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            position: relative;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            ${opacityStyle}
        ">
            
            <!-- Top Section with Gradient -->
            <div style="
                background: linear-gradient(135deg, ${primaryColor}15, ${secondaryColor}15);
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                position: relative;
            ">
                ${isProcessing ? `
                <div style="
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, transparent, ${primaryColor}, transparent);
                    animation: instaShimmer 2s infinite;
                "></div>
                ` : ''}
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;">
                    <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                        <!-- Icon with Gradient or Loading Spinner -->
                        <div style="
                            width: 56px;
                            height: 56px;
                            border-radius: 14px;
                            background: linear-gradient(135deg, ${primaryColor}, ${secondaryColor});
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-shrink: 0;
                            box-shadow: 0 4px 15px ${primaryColor}40;
                        ">
                            ${isProcessing ? `
                            <div style="
                                width: 32px;
                                height: 32px;
                                border: 3px solid rgba(255, 255, 255, 0.3);
                                border-top-color: white;
                                border-radius: 50%;
                                animation: instaSpin 1s linear infinite;
                            "></div>
                            ` : (isFailed ? `
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            ` : `
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                            </svg>
                            `)}
                        </div>
                        
                        <!-- Text Content -->
                        <div style="flex: 1; min-width: 0;">
                            <h3 style="
                                color: #ffffff;
                                font-size: 17px;
                                font-weight: 700;
                                margin: 0 0 6px 0;
                                line-height: 1.3;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                display: -webkit-box;
                                -webkit-line-clamp: 2;
                                -webkit-box-orient: vertical;
                            ">${isProcessing ? 'Generating Instagram Post...' : (isFailed ? 'Generation Failed' : title)}</h3>
                            ${subtitle && !isProcessing && !isFailed ? `<p style="
                                color: rgba(255, 255, 255, 0.6);
                                font-size: 13px;
                                margin: 0;
                                line-height: 1.4;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                white-space: nowrap;
                            ">${subtitle}</p>` : ''}
                            ${isProcessing ? `<p style="
                                color: rgba(255, 255, 255, 0.6);
                                font-size: 13px;
                                margin: 0;
                                line-height: 1.4;
                            ">Creating AI-powered content...</p>` : ''}
                            ${isFailed ? `<p style="
                                color: rgba(239, 68, 68, 0.8);
                                font-size: 13px;
                                margin: 0;
                                line-height: 1.4;
                            ">${post.error_message || 'An error occurred during generation'}</p>` : ''}
                        </div>
                    </div>
                    
                    <!-- Delete Button -->
                    <button ${isProcessing ? 'disabled' : `onclick="event.stopPropagation(); deleteInstaPost(${post.id})"`} style="
                        width: 36px;
                        height: 36px;
                        border-radius: 10px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: ${isProcessing ? 'not-allowed' : 'pointer'};
                        transition: all 0.2s;
                        flex-shrink: 0;
                        opacity: ${isProcessing ? '0.3' : '1'};
                    " ${!isProcessing ? `onmouseover="this.style.background='rgba(239, 68, 68, 0.15)'; this.style.borderColor='rgba(239, 68, 68, 0.3)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'; this.style.borderColor='rgba(255, 255, 255, 0.1)';"` : ''} title="${isProcessing ? 'Cannot delete while processing' : 'Delete Post'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255, 255, 255, 0.6)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <!-- Bottom Section with Meta Info -->
            <div style="padding: 16px 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                    <!-- Keyword -->
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="
                            color: rgba(255, 255, 255, 0.5);
                            font-size: 11px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        ">Keyword</span>
                        <span style="
                            color: rgba(255, 255, 255, 0.9);
                            font-size: 14px;
                            font-weight: 600;
                        ">${post.keyword}</span>
                    </div>
                    
                    <!-- Mode/Status Badge -->
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="
                            color: rgba(255, 255, 255, 0.5);
                            font-size: 11px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        ">${isProcessing || isFailed ? 'Status' : 'Mode'}</span>
                        <div>${isProcessing ? `
                            <span style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                padding: 6px 12px;
                                background: rgba(59, 130, 246, 0.15);
                                border: 1px solid rgba(59, 130, 246, 0.3);
                                border-radius: 8px;
                                color: rgb(96, 165, 250);
                                font-size: 12px;
                                font-weight: 700;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">
                                <div style="
                                    width: 6px;
                                    height: 6px;
                                    background: rgb(96, 165, 250);
                                    border-radius: 50%;
                                    animation: instaPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                                "></div>
                                Processing
                            </span>
                        ` : (isFailed ? `
                            <span style="
                                display: inline-flex;
                                align-items: center;
                                gap: 6px;
                                padding: 6px 12px;
                                background: rgba(239, 68, 68, 0.15);
                                border: 1px solid rgba(239, 68, 68, 0.3);
                                border-radius: 8px;
                                color: rgb(248, 113, 113);
                                font-size: 12px;
                                font-weight: 700;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">Failed</span>
                        ` : modeBadge)}</div>
                    </div>
                    
                    <!-- Date -->
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="
                            color: rgba(255, 255, 255, 0.5);
                            font-size: 11px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                        ">Created</span>
                        <span style="
                            color: rgba(255, 255, 255, 0.9);
                            font-size: 14px;
                            font-weight: 600;
                        ">${date}</span>
                    </div>
                </div>
                
                <!-- Color Swatches -->
                ${!isProcessing ? `
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                    <span style="
                        color: rgba(255, 255, 255, 0.5);
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">Colors:</span>
                    <div style="display: flex; gap: 6px;">
                        <div style="
                            width: 28px;
                            height: 28px;
                            border-radius: 6px;
                            background: ${primaryColor};
                            border: 2px solid rgba(255, 255, 255, 0.15);
                            box-shadow: 0 2px 8px ${primaryColor}40;
                        " title="${primaryColor}"></div>
                        <div style="
                            width: 28px;
                            height: 28px;
                            border-radius: 6px;
                            background: ${secondaryColor};
                            border: 2px solid rgba(255, 255, 255, 0.15);
                            box-shadow: 0 2px 8px ${secondaryColor}40;
                        " title="${secondaryColor}"></div>
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

async function viewInstaPost(postId, updateHistory = true) {
    console.log('Viewing Instagram post:', postId);
    
    // Update URL with post ID only if not loading from URL
    if (updateHistory) {
        history.pushState({ view: 'viewInstaPost', postId: postId }, '', `#viewInstaPost/${postId}`);
    }
    
    const post = await fetchInstaPost(postId);
    
    if (!post) {
        showNotification('Failed to load post details', 'error');
        return;
    }
    
    // Check if post is still processing
    if (post.status === 'processing') {
        showNotification('Post is still being generated. Please wait...', 'info');
        return;
    }
    
    document.getElementById('viewInstaPostTitle').textContent = post.title || post.keyword;
    document.getElementById('viewInstaPostSubtitle').textContent = `${post.mode} Post - Created ${new Date(post.created_at).toLocaleDateString()}`;
    
    // Store post for image generation
    currentViewingPost = post;
    
    const isHiring = post.mode === 'HIRING';
    
    const contentDiv = document.getElementById('viewInstaPostContent');
    contentDiv.innerHTML = `
        <div class="results-container" style="display: block;">
            <!-- Header Section with Key Info -->
            <div style="background: linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(255, 193, 7, 0.05)); border: 1px solid rgba(255, 215, 0, 0.2); border-radius: 16px; padding: 28px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 20px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 250px;">
                        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; background: ${isHiring ? 'rgba(139, 92, 246, 0.15)' : 'rgba(59, 130, 246, 0.15)'}; border: 1px solid ${isHiring ? 'rgba(139, 92, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'}; border-radius: 8px; margin-bottom: 12px;">
                            <span style="color: ${isHiring ? '#c4b5fd' : '#93c5fd'}; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${post.mode}</span>
                        </div>
                        <h2 style="color: var(--color-white); font-size: 26px; font-weight: 700; margin-bottom: 8px; line-height: 1.3;">${post.title || post.keyword}</h2>
                        ${post.subtitle ? `<p style="color: rgba(255, 255, 255, 0.7); font-size: 16px; line-height: 1.5; margin-bottom: 16px;">${post.subtitle}</p>` : ''}
                        ${post.keyword ? `<p style="color: rgba(255, 255, 255, 0.5); font-size: 13px;"><strong>Keyword:</strong> ${post.keyword}</p>` : ''}
                    </div>
                    
                    <!-- Color Palette -->
                    <div style="display: flex; flex-direction: column; gap: 10px; align-items: end;">
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="text-align: right;">
                                <div style="color: rgba(255, 255, 255, 0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Primary</div>
                                <div style="color: var(--color-white); font-size: 13px; font-family: monospace; font-weight: 600;">${post.primary_hex}</div>
                            </div>
                            <div style="width: 56px; height: 56px; border-radius: 12px; background: ${post.primary_hex}; border: 3px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 12px ${post.primary_hex}60;"></div>
                        </div>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="text-align: right;">
                                <div style="color: rgba(255, 255, 255, 0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Secondary</div>
                                <div style="color: var(--color-white); font-size: 13px; font-family: monospace; font-weight: 600;">${post.secondary_hex}</div>
                            </div>
                            <div style="width: 56px; height: 56px; border-radius: 12px; background: ${post.secondary_hex}; border: 3px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 12px ${post.secondary_hex}60;"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Hiring Details (if HIRING mode) -->
            ${isHiring && (post.position || post.experience || post.location) ? `
            <div style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                <h3 style="color: var(--color-white); font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    Job Details
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    ${post.position ? `
                    <div>
                        <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600;">Position</div>
                        <div style="color: var(--color-white); font-size: 16px; font-weight: 600;">${post.position}</div>
                    </div>
                    ` : ''}
                    ${post.experience ? `
                    <div>
                        <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600;">Experience</div>
                        <div style="color: var(--color-white); font-size: 16px; font-weight: 600;">${post.experience}</div>
                    </div>
                    ` : ''}
                    ${post.location ? `
                    <div>
                        <div style="color: rgba(255, 255, 255, 0.5); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; font-weight: 600;">Location</div>
                        <div style="color: var(--color-white); font-size: 16px; font-weight: 600;">${post.location}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            <!-- Two Column Layout: Final Prompt + Image Preview -->
            ${post.final_prompt ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; max-width: 1100px;">
                <!-- Left Column: Final AI Prompt -->
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <h3 style="color: var(--color-white); font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; margin: 0;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            Final AI Prompt
                        </h3>
                        <button onclick="openPromptEditor()" style="padding: 6px 14px; background: rgba(255, 215, 0, 0.15); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 6px; color: var(--color-primary); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.background='rgba(255, 215, 0, 0.25)'" onmouseout="this.style.background='rgba(255, 215, 0, 0.15)'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                        </button>
                    </div>
                    <div id="promptPreview" style="width: 100%; min-height: 350px; max-height: 450px; overflow-y: auto; color: rgba(255, 255, 255, 0.7); font-size: 13px; line-height: 1.7; white-space: pre-wrap; font-family: 'Courier New', monospace; background: rgba(0, 0, 0, 0.4); padding: 14px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">${post.final_prompt}</div>
                    <input type="hidden" id="editableFinalPrompt" value="${post.final_prompt.replace(/"/g, '&quot;')}">
                    <button id="previewGenerateBtn" class="submit-btn" onclick="generateImageForViewingPost()" style="width: 100%; margin-top: 14px; background: linear-gradient(135deg, #FFD700, #FFC500); color: #1A1A1A; padding: 10px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span class="btn-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg>
                        </span>
                        <span class="btn-text">Generate Banner Image</span>
                    </button>
                </div>
                
                <!-- Right Column: Image Preview -->
                <div id="imagePreviewColumn" style="display: flex; flex-direction: column; gap: 14px;">
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px;">
                        <h3 style="color: var(--color-white); font-size: 16px; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg>
                            Banner Preview
                        </h3>
                        <!-- Image container will be populated by JavaScript -->
                        <div id="bannerPreviewContainer" style="aspect-ratio: 1/1; width: 100%; background: rgba(0, 0, 0, 0.3); border-radius: 10px; display: flex; align-items: center; justify-content: center; border: 2px dashed rgba(255, 255, 255, 0.1);">
                            <div style="text-align: center; color: rgba(255, 255, 255, 0.4);">
                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 10px; opacity: 0.5;"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M20.4 14.5L16 10 4 20"/></svg>
                                <p style="font-size: 13px; margin: 0;">No image generated yet</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    // Manually switch to view without calling switchView (which would overwrite URL)
    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');
    
    navItems.forEach(item => item.classList.remove('active'));
    viewSections.forEach(section => {
        if (section.id === 'viewInstaPostView') {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
    
    // Load and display existing generated images if available
    console.log('Post data:', post);
    console.log('Generated image URLs:', post.generated_image_urls);
    if (post.generated_image_urls) {
        try {
            const savedUrls = JSON.parse(post.generated_image_urls);
            console.log('Parsed saved URLs:', savedUrls);
            if (savedUrls && savedUrls.length > 0) {
                // Display saved images automatically after view switch
                displayImagesInPostView(savedUrls);
            }
        } catch (error) {
            console.error('Error parsing saved image URLs:', error);
        }
    }
}

let deleteInstaPostId = null;

// Fullscreen Prompt Editor Functions
function openPromptEditor() {
    const promptValue = document.getElementById('editableFinalPrompt').value;
    
    // Create fullscreen modal
    const modal = document.createElement('div');
    modal.id = 'promptEditorModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.95); z-index: 10000; display: flex; flex-direction: column; animation: fadeIn 0.2s ease;';
    
    modal.innerHTML = `
        <div style="background: rgba(20, 20, 25, 0.98); border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;">
            <h2 style="color: var(--color-white); font-size: 18px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 10px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Edit Final AI Prompt
            </h2>
            <div style="display: flex; gap: 12px;">
                <button onclick="savePromptFromEditor()" style="padding: 10px 20px; background: linear-gradient(135deg, #FFD700, #FFC500); border: none; border-radius: 8px; color: #1a1a1a; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Save Changes
                </button>
                <button onclick="closePromptEditor()" style="padding: 10px 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: var(--color-white); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Close
                </button>
            </div>
        </div>
        <div style="flex: 1; padding: 24px; overflow: hidden; display: flex;">
            <textarea id="fullscreenPromptEditor" style="width: 100%; height: 100%; color: rgba(255, 255, 255, 0.9); font-size: 15px; line-height: 1.8; white-space: pre-wrap; font-family: 'Courier New', monospace; background: rgba(30, 30, 35, 0.8); padding: 24px; border-radius: 12px; border: 1px solid rgba(255, 215, 0, 0.2); resize: none; outline: none;" placeholder="Edit your AI prompt here...">${promptValue}</textarea>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('fullscreenPromptEditor').focus();
}

function closePromptEditor() {
    const modal = document.getElementById('promptEditorModal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => modal.remove(), 200);
    }
}

function savePromptFromEditor() {
    const editedPrompt = document.getElementById('fullscreenPromptEditor').value;
    
    // Update hidden input
    document.getElementById('editableFinalPrompt').value = editedPrompt;
    
    // Update preview
    document.getElementById('promptPreview').textContent = editedPrompt;
    
    // Close modal
    closePromptEditor();
    
    showNotification('Prompt updated successfully!', 'success');
}

function deleteInstaPost(postId) {
    deleteInstaPostId = postId;
    
    // Update modal for Instagram post deletion
    document.getElementById('deleteModalTitle').textContent = 'Delete Instagram Post?';
    document.getElementById('deleteModalMessage').textContent = 'Are you sure you want to delete this Instagram post? This action cannot be undone and all post data will be permanently removed.';
    document.getElementById('deleteConfirmBtnText').textContent = 'Delete Post';
    
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.style.display = 'flex';
    setTimeout(() => deleteModal.classList.add('active'), 10);
}

async function confirmDeleteInstaPost() {
    if (deleteInstaPostId) {
        const success = await deleteInstaPostAPI(deleteInstaPostId);
        if (success) {
            deleteInstaPostId = null;
            closeDeleteModal();
            loadInstaPostsList();
            loadDashboard();
        }
    }
}
