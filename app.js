class ModelMaker3D {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.transformControls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.objects = new Map();
    this.selectedObject = null;
    this.currentTool = "select";
    this.objectCounter = 0;

    this.gridHelper = null;
    this.showGrid = true;
    this.showWireframe = false;

    this.frameCount = 0;
    this.lastTime = performance.now();

    this.init();
    this.setupEventListeners();
    this.animate();
  }

  init() {
    const container = document.querySelector(".viewport-container");
    const canvas = document.getElementById("threejs-canvas");

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2a2a);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Grid helper
    this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
    this.scene.add(this.gridHelper);

    // Controls setup
    this.controls = new THREE.OrbitControls(
      this.camera,
      this.renderer.domElement
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI / 2;

    // Transform controls
    this.transformControls = new THREE.TransformControls(
      this.camera,
      this.renderer.domElement
    );
    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
    });
    this.transformControls.addEventListener("change", () => {
      this.updatePropertiesPanel();
    });
    this.scene.add(this.transformControls);

    // Mark as loaded and initialize status bar
    container.classList.add("loaded");
    this.updateStatusBar();

    // Handle window resize
    window.addEventListener("resize", () => this.handleResize());
  }

  setupEventListeners() {
    // Primitive buttons
    document.querySelectorAll("[data-primitive]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const primitive = e.currentTarget.dataset.primitive;
        this.addPrimitive(primitive);
      });
    });

    // Tool buttons
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tool = e.currentTarget.dataset.tool;
        this.setTool(tool);
        this.updateToolButtons();
      });
    });

    // View controls
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const view = e.currentTarget.dataset.view;
        this.handleViewControl(view, e.currentTarget);
      });
    });

    // Canvas events
    const canvas = this.renderer.domElement;
    canvas.addEventListener("click", (e) => this.handleCanvasClick(e));
    canvas.addEventListener("contextmenu", (e) => this.handleContextMenu(e));

    // Property inputs
    this.setupPropertyInputs();

    // Context menu
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".context-menu")) {
        this.hideContextMenu();
      }
    });
    document.getElementById("context-delete").addEventListener("click", () => {
      this.deleteSelectedObject();
      this.hideContextMenu();
    });
    document
      .getElementById("context-duplicate")
      .addEventListener("click", () => {
        this.duplicateSelectedObject();
        this.hideContextMenu();
      });
  }

  setupPropertyInputs() {
    const inputs = [
      "pos-x",
      "pos-y",
      "pos-z",
      "rot-x",
      "rot-y",
      "rot-z",
      "scale-x",
      "scale-y",
      "scale-z",
    ];
    inputs.forEach((id) => {
      const input = document.getElementById(id);
      input.addEventListener("input", () => this.updateObjectFromProperties());
    });

    // Color picker - fixed event handling
    const colorPicker = document.getElementById("object-color");
    colorPicker.addEventListener("change", (e) => {
      if (this.selectedObject) {
        const color = new THREE.Color(e.target.value);
        this.selectedObject.material.color = color;
        this.selectedObject.material.needsUpdate = true;
      }
    });

    // Also handle input event for real-time updates
    colorPicker.addEventListener("input", (e) => {
      if (this.selectedObject) {
        const color = new THREE.Color(e.target.value);
        this.selectedObject.material.color = color;
        this.selectedObject.material.needsUpdate = true;
      }
    });

    // Opacity slider
    const opacitySlider = document.getElementById("object-opacity");
    opacitySlider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      document.querySelector(".slider-value").textContent = value.toFixed(1);
      if (this.selectedObject) {
        this.selectedObject.material.opacity = value;
        this.selectedObject.material.transparent = value < 1;
        this.selectedObject.material.needsUpdate = true;
      }
    });

    // Object name
    document.getElementById("object-name").addEventListener("input", (e) => {
      if (this.selectedObject) {
        this.selectedObject.userData.name = e.target.value;
        this.updateStatusBar();
      }
    });
  }

  addPrimitive(type) {
    let geometry, material, mesh;

    const defaultMaterial = new THREE.MeshLambertMaterial({
      color: 0xff6b35,
      transparent: false,
      opacity: 1.0,
    });

    switch (type) {
      case "cube":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, 32);
        break;
      case "plane":
        geometry = new THREE.PlaneGeometry(1, 1);
        break;
      case "torus":
        geometry = new THREE.TorusGeometry(0.5, 0.2, 16, 100);
        break;
      default:
        return;
    }

    mesh = new THREE.Mesh(geometry, defaultMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.id = ++this.objectCounter;
    mesh.userData.name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${
      this.objectCounter
    }`;
    mesh.userData.type = type;

    this.scene.add(mesh);
    this.objects.set(mesh.userData.id, mesh);

    // Select the new object
    this.selectObject(mesh);
    this.updateStatusBar();
  }

  selectObject(object) {
    // Deselect current object
    if (this.selectedObject) {
      this.selectedObject.material.emissive.setHex(0x000000);
    }

    this.selectedObject = object;

    if (object) {
      // Highlight selected object
      object.material.emissive.setHex(0x222222);

      // Attach transform controls
      this.transformControls.attach(object);
      this.transformControls.setMode(
        this.currentTool === "select" ? "translate" : this.currentTool
      );
    } else {
      this.transformControls.detach();
    }

    this.updatePropertiesPanel();
    this.updateStatusBar();
  }

  setTool(tool) {
    this.currentTool = tool;

    if (this.selectedObject) {
      if (tool === "delete") {
        this.deleteSelectedObject();
        return;
      }

      const mode = tool === "select" ? "translate" : tool;
      this.transformControls.setMode(mode);
    }
  }

  updateToolButtons() {
    document.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === this.currentTool);
    });
  }

  handleViewControl(view, button) {
    switch (view) {
      case "wireframe":
        this.showWireframe = !this.showWireframe;
        button.classList.toggle("active", this.showWireframe);
        this.updateWireframeMode();
        break;
      case "grid":
        this.showGrid = !this.showGrid;
        button.classList.toggle("active", this.showGrid);
        this.gridHelper.visible = this.showGrid;
        break;
      case "reset":
        this.resetView();
        break;
    }
  }

  updateWireframeMode() {
    this.objects.forEach((object) => {
      object.material.wireframe = this.showWireframe;
    });
  }

  resetView() {
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
    this.controls.reset();
  }

  handleCanvasClick(event) {
    if (event.button !== 0) return; // Only left click

    this.mouse.x =
      (event.offsetX / this.renderer.domElement.clientWidth) * 2 - 1;
    this.mouse.y =
      -(event.offsetY / this.renderer.domElement.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects([
      ...this.objects.values(),
    ]);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.selectObject(object);
    } else {
      this.selectObject(null);
    }
  }

  handleContextMenu(event) {
    event.preventDefault();

    this.mouse.x =
      (event.offsetX / this.renderer.domElement.clientWidth) * 2 - 1;
    this.mouse.y =
      -(event.offsetY / this.renderer.domElement.clientHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects([
      ...this.objects.values(),
    ]);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.selectObject(object);
      this.showContextMenu(event.clientX, event.clientY);
    }
  }

  showContextMenu(x, y) {
    const menu = document.getElementById("context-menu");
    menu.classList.remove("hidden");

    // Ensure menu stays within viewport
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const finalX = x + menuRect.width > viewportWidth ? x - menuRect.width : x;
    const finalY =
      y + menuRect.height > viewportHeight ? y - menuRect.height : y;

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
  }

  hideContextMenu() {
    document.getElementById("context-menu").classList.add("hidden");
  }

  deleteSelectedObject() {
    if (this.selectedObject) {
      const id = this.selectedObject.userData.id;
      this.scene.remove(this.selectedObject);
      this.objects.delete(id);
      this.selectedObject = null;
      this.transformControls.detach();
      this.updatePropertiesPanel();
      this.updateStatusBar();
    }
  }

  duplicateSelectedObject() {
    if (this.selectedObject) {
      const original = this.selectedObject;
      const geometry = original.geometry.clone();
      const material = original.material.clone();
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.copy(original.position);
      mesh.position.x += 1;
      mesh.rotation.copy(original.rotation);
      mesh.scale.copy(original.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.id = ++this.objectCounter;
      mesh.userData.name = `${original.userData.name} Copy`;
      mesh.userData.type = original.userData.type;

      this.scene.add(mesh);
      this.objects.set(mesh.userData.id, mesh);
      this.selectObject(mesh);
      this.updateStatusBar();
    }
  }

  updatePropertiesPanel() {
    const nameInput = document.getElementById("object-name");
    const posInputs = ["pos-x", "pos-y", "pos-z"];
    const rotInputs = ["rot-x", "rot-y", "rot-z"];
    const scaleInputs = ["scale-x", "scale-y", "scale-z"];
    const colorInput = document.getElementById("object-color");
    const opacitySlider = document.getElementById("object-opacity");

    if (this.selectedObject) {
      const obj = this.selectedObject;

      // Enable inputs
      [...posInputs, ...rotInputs, ...scaleInputs].forEach((id) => {
        document.getElementById(id).disabled = false;
      });
      colorInput.disabled = false;
      opacitySlider.disabled = false;
      nameInput.readOnly = false;

      // Update values
      nameInput.value = obj.userData.name;

      document.getElementById("pos-x").value = obj.position.x.toFixed(2);
      document.getElementById("pos-y").value = obj.position.y.toFixed(2);
      document.getElementById("pos-z").value = obj.position.z.toFixed(2);

      document.getElementById("rot-x").value = (
        (obj.rotation.x * 180) /
        Math.PI
      ).toFixed(1);
      document.getElementById("rot-y").value = (
        (obj.rotation.y * 180) /
        Math.PI
      ).toFixed(1);
      document.getElementById("rot-z").value = (
        (obj.rotation.z * 180) /
        Math.PI
      ).toFixed(1);

      document.getElementById("scale-x").value = obj.scale.x.toFixed(2);
      document.getElementById("scale-y").value = obj.scale.y.toFixed(2);
      document.getElementById("scale-z").value = obj.scale.z.toFixed(2);

      colorInput.value = `#${obj.material.color.getHexString()}`;
      opacitySlider.value = obj.material.opacity;
      document.querySelector(".slider-value").textContent =
        obj.material.opacity.toFixed(1);
    } else {
      // Disable inputs
      [...posInputs, ...rotInputs, ...scaleInputs].forEach((id) => {
        const input = document.getElementById(id);
        input.disabled = true;
        input.value = "";
      });
      colorInput.disabled = true;
      colorInput.value = "#ff6b35";
      opacitySlider.disabled = true;
      opacitySlider.value = 1;
      nameInput.readOnly = true;
      nameInput.value = "No selection";
      document.querySelector(".slider-value").textContent = "1.0";
    }
  }

  updateObjectFromProperties() {
    if (!this.selectedObject) return;

    const obj = this.selectedObject;

    // Position
    obj.position.x = parseFloat(document.getElementById("pos-x").value) || 0;
    obj.position.y = parseFloat(document.getElementById("pos-y").value) || 0;
    obj.position.z = parseFloat(document.getElementById("pos-z").value) || 0;

    // Rotation (convert degrees to radians)
    obj.rotation.x =
      ((parseFloat(document.getElementById("rot-x").value) || 0) * Math.PI) /
      180;
    obj.rotation.y =
      ((parseFloat(document.getElementById("rot-y").value) || 0) * Math.PI) /
      180;
    obj.rotation.z =
      ((parseFloat(document.getElementById("rot-z").value) || 0) * Math.PI) /
      180;

    // Scale
    obj.scale.x = parseFloat(document.getElementById("scale-x").value) || 1;
    obj.scale.y = parseFloat(document.getElementById("scale-y").value) || 1;
    obj.scale.z = parseFloat(document.getElementById("scale-z").value) || 1;
  }

  updateStatusBar() {
    document.getElementById(
      "object-count"
    ).textContent = `Objects: ${this.objects.size}`;

    const selectedText = this.selectedObject
      ? this.selectedObject.userData.name
      : "None";
    document.getElementById(
      "selected-object"
    ).textContent = `Selected: ${selectedText}`;

    // Update camera info
    const camPos = this.camera.position;
    document.getElementById(
      "camera-info"
    ).textContent = `Camera: (${camPos.x.toFixed(1)}, ${camPos.y.toFixed(
      1
    )}, ${camPos.z.toFixed(1)})`;
  }

  updateFPS() {
    this.frameCount++;
    const currentTime = performance.now();

    if (currentTime - this.lastTime >= 1000) {
      const fps = Math.round(
        (this.frameCount * 1000) / (currentTime - this.lastTime)
      );
      document.getElementById("fps-counter").textContent = `FPS: ${fps}`;
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
  }

  handleResize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateFPS();

    // Update status bar periodically
    if (this.frameCount % 30 === 0) {
      this.updateStatusBar();
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  new ModelMaker3D();
});
