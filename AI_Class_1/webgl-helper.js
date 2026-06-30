/**
 * webgl-helper.js - WebGL Render Engine
 * Handles high-performance GPU image processing for distortions and color grading.
 */

class WebGLRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.initialized = false;
    
    // Shader Uniform Locations
    this.uniforms = {};
    
    // Active filter properties
    this.filterType = 0; // 0 = Pass-through, 1 = Comic, 2 = Funhouse
    this.distortionMode = 1; // 1 = Bulge, 2 = Pinch, 3 = Kaleidoscope
    this.faceCenter = [0.5, 0.5];
    this.faceRadius = 0.25;
    this.distortionPower = 0.45; // Default bulge power
    
    this.initWebGL();
  }

  /**
   * Initializes the WebGL context, geometry, and shaders.
   */
  initWebGL() {
    this.gl = this.canvas.getContext('webgl', { 
      alpha: false, 
      depth: false, 
      stencil: false, 
      antialias: true,
      preserveDrawingBuffer: true // Required to allow Canvas screenshot capture
    }) || this.canvas.getContext('experimental-webgl', { 
      alpha: false, 
      depth: false, 
      preserveDrawingBuffer: true 
    });

    if (!this.gl) {
      console.error("WebGL not supported in this browser.");
      return;
    }

    const gl = this.gl;

    // Vertex Shader Source
    const vsSource = `
      attribute vec2 position;
      varying vec2 v_texCoord;
      void main() {
        // Map [-1, 1] vertex coordinates to [0, 1] texture coordinates
        // Flip Y axis vertically since webcams and WebGL textures are inverted relative to each other
        v_texCoord = vec2((position.x + 1.0) / 2.0, (1.0 - position.y) / 2.0);
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment Shader Source
    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      
      uniform sampler2D u_texture;
      uniform int u_filterType;          // 0 = Pass, 1 = Comic, 2 = Funhouse
      uniform int u_distortionMode;      // 1 = Bulge, 2 = Pinch, 3 = Kaleidoscope
      uniform vec2 u_faceCenter;         // Center of face in UV space
      uniform float u_faceRadius;        // Bounding radius of face
      uniform float u_distortionPower;   // Strength parameter
      uniform float u_aspectRatio;       // viewport width / height
      uniform float u_time;              // clock time in seconds

      // Correct coordinate stretching by applying aspect ratio factor
      vec2 getAspectCorrectOffset(vec2 uv, vec2 center, float aspect) {
        vec2 offset = uv - center;
        offset.x *= aspect;
        return offset;
      }

      // Restore coordinates back from aspect space to UV space
      vec2 restoreAspectOffset(vec2 offset, vec2 center, float aspect) {
        offset.x /= aspect;
        return offset + center;
      }

      void main() {
        vec2 uv = v_texCoord;
        float aspect = u_aspectRatio;

        // --- STAGE 1: Spatial Distortions (Funhouse Mirror) ---
        if (u_filterType == 2) {
          vec2 offset = getAspectCorrectOffset(uv, u_faceCenter, aspect);
          float dist = length(offset);
          
          if (dist < u_faceRadius) {
            float percent = dist / u_faceRadius;
            
            if (u_distortionMode == 1) {
              // 1. BULGE (Fisheye Lens)
              // We sample coordinates closer to center than actual (power < 1.0)
              float warp = pow(percent, u_distortionPower);
              vec2 warpedOffset = normalize(offset) * u_faceRadius * warp;
              uv = restoreAspectOffset(warpedOffset, u_faceCenter, aspect);
              
            } else if (u_distortionMode == 2) {
              // 2. PINCH
              // We sample coordinates further away from center (power > 1.0)
              float warp = pow(percent, 2.3);
              vec2 warpedOffset = normalize(offset) * u_faceRadius * warp;
              uv = restoreAspectOffset(warpedOffset, u_faceCenter, aspect);
              
            } else if (u_distortionMode == 3) {
              // 3. KALEIDOSCOPE
              // Partition angular coordinate around face center into segments
              float angle = atan(offset.y, offset.x);
              float numSegments = 8.0;
              float segmentSize = 6.2831853 / numSegments;
              
              // Mirror angle inside segment
              float localAngle = mod(angle, segmentSize);
              if (localAngle > segmentSize * 0.5) {
                localAngle = segmentSize - localAngle;
              }
              
              vec2 mirroredOffset = vec2(cos(localAngle), sin(localAngle)) * dist;
              uv = restoreAspectOffset(mirroredOffset, u_faceCenter, aspect);
            }
          }
        }

        // Clamp UV coordinates to avoid border bleeding
        uv = clamp(uv, 0.001, 0.999);
        vec4 color = texture2D(u_texture, uv);

        // --- STAGE 2: Color Effects (Comic Book Hero) ---
        if (u_filterType == 1) {
          // Increase saturation
          float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
          vec3 saturated = mix(vec3(luma), color.rgb, 1.85);
          
          // Color quantization (Posterize)
          vec3 quantized = floor(saturated * 4.0) / 4.0;
          
          // Apply black Halftone Dots overlay based on brightness
          // Dot grid sized dynamically
          float dotScale = 6.0;
          vec2 dotUV = gl_FragCoord.xy / dotScale;
          vec2 localDot = fract(dotUV) - 0.5;
          float dotDist = length(localDot);
          
          // Darker colors create larger halftone dots
          float maxRadius = 0.55;
          float dotRadius = (1.0 - luma) * maxRadius;
          
          if (dotDist < dotRadius) {
            // Apply halftone shading (fade to dark comic cyan/black instead of pure flat black)
            quantized = mix(quantized, vec3(0.02, 0.05, 0.1), 0.85);
          }
          
          gl_FragColor = vec4(quantized, 1.0);
        } else {
          gl_FragColor = color;
        }
      }
    `;

    // Compile and Link Program
    const vs = this.compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = this.compileShader(fsSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("Shader Link Error:", gl.getProgramInfoLog(this.program));
      return;
    }

    gl.useProgram(this.program);

    // Setup Position Buffers
    const positionLocation = gl.getAttribLocation(this.program, 'position');
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    
    // Two triangles forming a full-screen quad [-1, -1] to [1, 1]
    const vertices = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Setup Texture pipeline
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Get Uniform Locations
    this.uniforms = {
      filterType: gl.getUniformLocation(this.program, 'u_filterType'),
      distortionMode: gl.getUniformLocation(this.program, 'u_distortionMode'),
      faceCenter: gl.getUniformLocation(this.program, 'u_faceCenter'),
      faceRadius: gl.getUniformLocation(this.program, 'u_faceRadius'),
      distortionPower: gl.getUniformLocation(this.program, 'u_distortionPower'),
      aspectRatio: gl.getUniformLocation(this.program, 'u_aspectRatio'),
      time: gl.getUniformLocation(this.program, 'u_time')
    };

    this.initialized = true;
  }

  /**
   * Helper function to compile shader stages.
   */
  compileShader(source, type) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`Shader Compilation Error (${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'}):`, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  /**
   * Resizes WebGL draw buffer to match display resolution.
   */
  resize(width, height) {
    if (!this.initialized) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Updates rendering params for GPU uniforms.
   */
  setFilterParams(filterType, distMode, faceCenter, faceRadius, distPower) {
    this.filterType = filterType;
    this.distortionMode = distMode;
    if (faceCenter) this.faceCenter = faceCenter;
    if (faceRadius) this.faceRadius = faceRadius;
    if (distPower) this.distortionPower = distPower;
  }

  /**
   * Renders the current frame.
   * @param {HTMLVideoElement} video Webcam stream source
   */
  render(video, timestamp) {
    if (!this.initialized || !video || video.readyState < video.HAVE_CURRENT_DATA) return;

    const gl = this.gl;
    
    // Copy the latest webcam frame to the texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Calculate aspect ratio
    const aspect = this.canvas.width / this.canvas.height;

    // Send Uniform Values
    gl.uniform1i(this.uniforms.filterType, this.filterType);
    gl.uniform1i(this.uniforms.distortionMode, this.distortionMode);
    gl.uniform2f(this.uniforms.faceCenter, this.faceCenter[0], this.faceCenter[1]);
    gl.uniform1f(this.uniforms.faceRadius, this.faceRadius);
    gl.uniform1f(this.uniforms.distortionPower, this.distortionPower);
    gl.uniform1f(this.uniforms.aspectRatio, aspect);
    gl.uniform1f(this.uniforms.time, timestamp / 1000.0);

    // Draw full-screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
