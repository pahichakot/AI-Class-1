/**
 * main.js - Core Coordination Engine
 * Manages webcam lifecycle, AI tracking loop, user interaction states, and screen capture.
 */

// Application State
const state = {
  activeFilterIndex: 0,
  isMuted: false,
  cameraStream: null,
  isTracking: false,
  lastFaceData: null,
  dampenedCenter: [0.5, 0.5],
  dampenedRadius: 0.25,
  lastFrameTime: performance.now(),
  frameCount: 0,
};

// Filter Config Array
const filtersList = [
  { name: "COMIC BOOK HERO", type: 1, classIndex: 0, distMode: 1, distPower: 0.45 },
  { name: "PUPPY PAL",       type: 0, classIndex: 1, distMode: 0, distPower: 0.0 },
  { name: "FUNHOUSE BULGE",  type: 2, classIndex: 2, distMode: 1, distPower: 0.45 },
  { name: "FUNHOUSE PINCH",  type: 2, classIndex: 2, distMode: 2, distPower: 0.45 },
  { name: "KALEIDOSCOPE",    type: 2, classIndex: 2, distMode: 3, distPower: 0.0 }
];

// DOM References
let videoEl, glCanvas, overlayCanvas, overlayCtx, glRenderer;
let startScreen, loadingScreen, loadingProgress, permissionError;

// Initialize on window load
window.addEventListener('DOMContentLoaded', () => {
  initDOM();
  initUI();
});

/**
 * Get DOM element hooks
 */
function initDOM() {
  videoEl = document.getElementById('webcam');
  glCanvas = document.getElementById('gl-canvas');
  overlayCanvas = document.getElementById('overlay-canvas');
  overlayCtx = overlayCanvas.getContext('2d');
  
  startScreen = document.getElementById('start-screen');
  loadingScreen = document.getElementById('loading-screen');
  loadingProgress = document.getElementById('loading-progress');
  permissionError = document.getElementById('permission-error');
}

/**
 * Setup navigation buttons, keyboard binds, and filter pips
 */
function initUI() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const snapBtn = document.getElementById('snap-btn');
  const soundBtn = document.getElementById('sound-btn');
  const retryBtn = document.getElementById('retry-camera-btn');
  const startCameraBtn = document.getElementById('start-camera-btn');
  const pipsContainer = document.getElementById('filter-pips-container');

  // Generate selection indicator pips
  filtersList.forEach((filter, index) => {
    const pip = document.createElement('button');
    pip.className = `pip ${index === state.activeFilterIndex ? 'active' : ''}`;
    pip.setAttribute('aria-label', `Select ${filter.name}`);
    pip.addEventListener('click', () => selectFilter(index));
    pipsContainer.appendChild(pip);
  });

  // Nav actions
  prevBtn.addEventListener('click', () => changeFilter(-1));
  nextBtn.addEventListener('click', () => changeFilter(1));
  snapBtn.addEventListener('click', captureSnapshot);
  
  // Sound toggle button click handler
  soundBtn.addEventListener('click', () => {
    const isMuted = window.sfx.toggleMute();
    state.isMuted = isMuted;
    updateSoundUI();
  });

  // Start Camera Action
  if (startCameraBtn) {
    startCameraBtn.addEventListener('click', startCameraFlow);
  }

  // Camera retry action
  if (retryBtn) {
    retryBtn.addEventListener('click', startCameraFlow);
  }

  // Sync initial sound state icon
  state.isMuted = window.sfx.muted;
  updateSoundUI();

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      changeFilter(1);
    } else if (e.key === 'ArrowLeft') {
      changeFilter(-1);
    } else if (e.key === ' ' || e.key.toLowerCase() === 's') {
      e.preventDefault(); // Stop spacebar scrolling page down
      captureSnapshot();
    }
  });

  // Keep canvases properly scaled during browser window resizing
  window.addEventListener('resize', handleResize);
}

/**
 * Initiates the webcam permission and tracking pipeline after a user interaction
 */
function startCameraFlow() {
  // Lazily unlock the AudioContext on user interaction
  window.sfx.init();
  if (window.sfx.ctx && window.sfx.ctx.state === 'suspended') {
    window.sfx.ctx.resume();
  }
  window.sfx.playSwitch();

  // Switch overlays
  if (startScreen) startScreen.classList.add('hidden');
  if (permissionError) permissionError.classList.add('hidden');
  if (loadingScreen) loadingScreen.classList.remove('hidden');

  setupApp();
}

/**
 * Setup camera feed and MediaPipe models
 */
async function setupApp() {
  updateProgress(15);
  
  // Browser capabilities check
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    handleCameraError(new Error("BrowserUnsupported"));
    return;
  }

  // Secure context environment check
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    handleCameraError(new Error("InsecureContext"));
    return;
  }

  // Initialize GPU WebGL engine
  glRenderer = new WebGLRenderer('gl-canvas');
  if (!glRenderer.initialized) {
    console.warn("WebGL failed to initialize on your system. Shaders are disabled.");
  }

  updateProgress(30);

  // 1. Startup webcam stream with automatic low-res fallback
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });
  } catch (firstErr) {
    console.warn("High-res video request failed, trying standard video parameters:", firstErr);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    } catch (secondErr) {
      handleCameraError(secondErr);
      return;
    }
  }
  
  updateProgress(55);

  try {
    videoEl.srcObject = stream;
    state.cameraStream = stream;
    
    // Await stream data metadata & play
    await new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          reject(new Error("WebcamStreamTimeout"));
        }
      }, 8000); // 8 second timeout

      videoEl.onloadedmetadata = () => {
        videoEl.play()
          .then(() => {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          })
          .catch(err => {
            resolved = true;
            clearTimeout(timeout);
            reject(err);
          });
      };
    });
    
    handleResize(); // Adjust layout to match webcam dimensions
  } catch (playErr) {
    handleCameraError(playErr);
    return;
  }

  updateProgress(75);

  // 2. Initialize MediaPipe FaceMesh
  try {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    // Setup custom frame rendering loop
    const renderLoop = async () => {
      if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
        try {
          await faceMesh.send({ image: videoEl });
        } catch (e) {
          console.error("FaceMesh parsing error:", e);
        }
      }
      requestAnimationFrame(renderLoop);
    };

    updateProgress(90);
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error("MediaPipe initialization failed:", err);
    alert("Could not load tracking models from CDN. Please check your internet connection.");
  }
}

/**
 * Friendly user-facing error handler for camera access exceptions
 */
function handleCameraError(err) {
  console.error("AURA WEBCAM ACCESS FAILURE:", err);
  
  let title = "WEBCAM ACCESS FAILED";
  let desc = "An unexpected error occurred while connecting to the camera.";

  const name = err.name || '';
  const message = err.message || '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || message.includes('Permission denied')) {
    title = "CAMERA PERMISSION DENIED";
    desc = "AURA requires access to your camera to overlay filters in real-time. Please click the Lock or Camera icon in your browser's address bar, change the 'Camera' permission to 'Allow', and then click retry.";
  } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || message.includes('Device not found')) {
    title = "NO CAMERA FOUND";
    desc = "No physical camera device was detected on your computer. Please make sure your webcam is plugged in, powered on, and recognized by your system settings, then click retry.";
  } else if (name === 'NotReadableError' || name === 'TrackStartError' || message === 'WebcamStreamTimeout') {
    title = "WEBCAM IS ALREADY BUSY";
    desc = "Your webcam is currently locked or in use by another program (such as Zoom, Teams, Discord, or Skype). Please close any other applications using the camera, verify the camera's indicator light is off, and click retry.";
  } else if (name === 'SecurityError' || message === 'InsecureContext') {
    title = "INSECURE ENVIRONMENT";
    desc = "Web browsers restrict camera permissions to secure connections (localhost or HTTPS). Please check that you are running the project on http://localhost:8000.";
  } else if (message === 'BrowserUnsupported') {
    title = "BROWSER UNSUPPORTED";
    desc = "Your web browser does not support standard webcam media capture APIs. Please try running the app on a modern browser like Google Chrome, Mozilla Firefox, Safari, or Microsoft Edge.";
  } else {
    desc = `Diagnostic Error Details: [${name || 'System Error'}] ${message || err}`;
  }

  // Hide loading overlay
  if (loadingScreen) loadingScreen.classList.add('hidden');

  // Display text in fallback card
  const errorTitleEl = document.getElementById('error-title');
  const errorDescEl = document.getElementById('error-desc');
  
  if (errorTitleEl) errorTitleEl.innerText = title;
  if (errorDescEl) errorDescEl.innerText = desc;

  // Show permission error card
  if (permissionError) permissionError.classList.remove('hidden');
}

/**
 * Handle incoming facial landmarks from AI weight models
 */
function onResults(results) {
  // Hide loading screen & show connected success indicator on first frame received
  if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
    loadingScreen.classList.add('hidden');
    
    // Play arpeggio chime chime
    setTimeout(() => window.sfx.playChime(), 200);

    // Show Success Toast Notification
    const toast = document.getElementById('toast');
    if (toast) {
      const originalText = toast.innerText;
      toast.innerText = "✨ Webcam Connected & Tracking Active! ✨";
      toast.classList.add('toast-show');
      setTimeout(() => {
        toast.classList.remove('toast-show');
        // Restore default text after transition fades
        setTimeout(() => {
          toast.innerText = originalText;
        }, 400);
      }, 3000);
    }
  }

  const trackingVal = document.getElementById('tracking-val');
  const hasFace = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0;
  
  if (hasFace) {
    state.isTracking = true;
    trackingVal.innerText = "TRACKED";
    trackingVal.className = "metric-val status-connected";
    
    const landmarks = results.multiFaceLandmarks[0];
    state.lastFaceData = landmarks;

    // Calculate face center & radius in UV coordinates (0.0 to 1.0)
    const noseBridge = landmarks[4]; // Center reference
    const leftCheek = landmarks[234]; // Left reference
    
    const targetCenter = [noseBridge.x, noseBridge.y];
    
    // Calculate Euclidean distance in UV space for face radius
    const dx = leftCheek.x - noseBridge.x;
    const dy = leftCheek.y - noseBridge.y;
    const targetRadius = Math.sqrt(dx * dx + dy * dy) * 1.3; // Scale factor

    // Apply linear interpolation (lerp) damping to smooth tracking movements and prevent jitter
    state.dampenedCenter[0] += (targetCenter[0] - state.dampenedCenter[0]) * 0.25;
    state.dampenedCenter[1] += (targetCenter[1] - state.dampenedCenter[1]) * 0.25;
    state.dampenedRadius += (targetRadius - state.dampenedRadius) * 0.25;
  } else {
    state.isTracking = false;
    trackingVal.innerText = "NO FACE";
    trackingVal.className = "metric-val status-disconnected";
    
    // Keep target at last position or slowly drift to center of screen
    state.dampenedCenter[0] += (0.5 - state.dampenedCenter[0]) * 0.05;
    state.dampenedCenter[1] += (0.5 - state.dampenedCenter[1]) * 0.05;
    state.dampenedRadius += (0.25 - state.dampenedRadius) * 0.05;
  }

  // --- RENDERING PIPELINE ---
  const currentFilter = filtersList[state.activeFilterIndex];

  // 1. Update GPU WebGL uniforms and render distorted video
  glRenderer.setFilterParams(
    currentFilter.type,
    currentFilter.distMode,
    state.dampenedCenter,
    state.dampenedRadius,
    currentFilter.distPower
  );
  glRenderer.render(videoEl, performance.now());

  // 2. Clear Canvas 2D overlays
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // 3. Render SVG / Vector Overlays
  if (state.isTracking && state.lastFaceData) {
    const activeOverlay = window.filterOverlays[currentFilter.classIndex];
    if (activeOverlay) {
      activeOverlay.draw(
        overlayCtx, 
        state.lastFaceData, 
        overlayCanvas.width, 
        overlayCanvas.height
      );
    }
  } else {
    // If tracking lost, still run particle animations so particles fade out naturally
    window.filterOverlays.forEach(overlay => {
      overlay.updateParticles(overlayCtx, overlayCanvas.width, overlayCanvas.height);
    });
  }

  // Calculate & Draw FPS performance Diagnostics
  calculateFPS();
}

/**
 * Cycles filters by index offset
 */
function changeFilter(direction) {
  let index = state.activeFilterIndex + direction;
  if (index >= filtersList.length) index = 0;
  if (index < 0) index = filtersList.length - 1;
  selectFilter(index);
}

/**
 * Directly selects filter by index
 */
function selectFilter(index) {
  if (index === state.activeFilterIndex) return;
  state.activeFilterIndex = index;
  
  // Play switch synthesizer noise
  window.sfx.playSwitch();

  const filter = filtersList[index];

  // Update UI headers
  const filterNameDisplay = document.getElementById('filter-name');
  filterNameDisplay.style.opacity = 0;
  filterNameDisplay.style.transform = 'translateY(-5px)';

  setTimeout(() => {
    filterNameDisplay.innerText = filter.name;
    filterNameDisplay.style.opacity = 1;
    filterNameDisplay.style.transform = 'translateY(0)';
  }, 150);

  // Update selection pip dots active state
  const pips = document.querySelectorAll('.filter-pips .pip');
  pips.forEach((pip, i) => {
    if (i === index) {
      pip.classList.add('active');
    } else {
      pip.classList.remove('active');
    }
  });
}

/**
 * Capture high-resolution photo from canvases
 */
function captureSnapshot() {
  window.sfx.playShutter();

  // Flash UI Trigger
  const flash = document.getElementById('camera-flash');
  flash.classList.add('flash-active');
  setTimeout(() => flash.classList.remove('flash-active'), 350);

  // Create temporary flatten canvas to combine WebGL and Canvas 2D contents
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = glCanvas.width;
  tempCanvas.height = glCanvas.height;
  const tempCtx = tempCanvas.getContext('2d');

  // Copy WebGL background (assumes preserveDrawingBuffer = true)
  tempCtx.drawImage(glCanvas, 0, 0);

  // Copy Canvas 2D overlay foreground
  tempCtx.drawImage(overlayCanvas, 0, 0);

  // Convert to image download stream
  try {
    const dataUrl = tempCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `AURA_Snap_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    
    // Show confirmation Toast
    const toast = document.getElementById('toast');
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 2500);
  } catch (err) {
    console.error("Snapshot capture error:", err);
  }
}

/**
 * Resizes aspect ratios when window changes scale
 */
function handleResize() {
  const viewport = document.getElementById('viewport');
  if (!viewport || !videoEl) return;

  const videoW = videoEl.videoWidth || 640;
  const videoH = videoEl.videoHeight || 480;

  // Set viewport container aspect ratio
  viewport.style.aspectRatio = `${videoW} / ${videoH}`;

  const rect = viewport.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);

  if (w === 0 || h === 0) return;

  if (glRenderer && glRenderer.initialized) {
    glRenderer.resize(w, h);
  }

  overlayCanvas.width = w;
  overlayCanvas.height = h;
}

/**
 * Smooth UI progress update
 */
function updateProgress(value) {
  if (loadingProgress) {
    loadingProgress.style.width = `${value}%`;
  }
}

/**
 * Sync UI Icons for audio mute
 */
function updateSoundUI() {
  const soundOnIcon = document.getElementById('sound-on-icon');
  const soundOffIcon = document.getElementById('sound-off-icon');

  if (state.isMuted) {
    soundOnIcon.classList.add('hidden');
    soundOffIcon.classList.remove('hidden');
  } else {
    soundOnIcon.classList.remove('hidden');
    soundOffIcon.classList.add('hidden');
  }
}

/**
 * Calculates rendering FPS
 */
function calculateFPS() {
  state.frameCount++;
  const now = performance.now();
  const elapsed = now - state.lastFrameTime;

  if (elapsed >= 1000) {
    const fps = Math.round((state.frameCount * 1000) / elapsed);
    document.getElementById('fps-val').innerText = fps;
    state.frameCount = 0;
    state.lastFrameTime = now;
  }
}
