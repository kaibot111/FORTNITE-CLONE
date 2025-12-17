const socket = io();

// --- 1. SETTINGS (TWEAK THESE TO FIX CAMERA) ---
const MODEL_SCALE = 0.0000000001;      // Scale of the FBX (Make smaller if player is huge)
const CAMERA_OFFSET_Y = 5;     // How high the camera is (0 is ground, 6 is above head)
const CAMERA_OFFSET_Z = 0;     // How far back the camera is (behind player)
const PLAYER_SPEED = 15.0;
const JUMP_FORCE = 25.0;

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding; 
document.body.appendChild(renderer.domElement);

// Add extra light so the model isn't just a silhouette
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// --- Game State ---
let myId = null;
const players = {}; 
const colliders = []; 
let ammo = 20;
let isReloading = false;
let isLocked = false;
let loadedModel = null; 

// Physics Variables
let velocity = new THREE.Vector3();
let canJump = false;
const gravity = 50.0; 

// --- PLAYER CONTAINER (Invisible box that moves) ---
const playerMesh = new THREE.Group();
scene.add(playerMesh);

// --- CAMERA RIG ---
// 1. The Pivot (Rotates up/down)
const pitchObject = new THREE.Object3D();
pitchObject.position.y = CAMERA_OFFSET_Y / 2; // Position pivot near chest/head
playerMesh.add(pitchObject);

// 2. The Camera (Attached to pivot, moved back)
pitchObject.add(camera);
camera.position.set(0, 0, CAMERA_OFFSET_Z); // Move camera BACK
camera.lookAt(0, 0, 0); // Look at the pivot

// --- FBX LOADER LOGIC ---
const loader = new THREE.FBXLoader();

loader.load('samurai-vader.fbx', (object) => {
    console.log("FBX Model Loaded!");
    loadedModel = object;
    
    // Scale the model
    loadedModel.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    
    // Attach model to OUR player container
    const myFigure = loadedModel.clone();
    
    // Offset Y so feet are on ground (sometimes models float)
    myFigure.position.y = -1; 
    
    // Rotate 180 degrees so back is to camera
    myFigure.rotation.y = Math.PI; 
    
    playerMesh.add(myFigure);

}, undefined, (error) => {
    console.error('Error loading model:', error);
});

// --- World Builder ---
function buildWorld(mapData) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    
    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Buildings
    mapData.buildings.forEach(b => {
        const mat = new THREE.MeshStandardMaterial({ color: b.type === 'barn' ? 0x8B4513 : 0x808080 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.h / 2, b.z);
        mesh.scale.set(8, b.h, 8);
        scene.add(mesh);
        mesh.updateMatrixWorld(); 
        colliders.push(mesh);
    });

    // Trees
    mapData.trees.forEach(t => {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x8B4513 }));
        trunk.position.set(t.x, 2, t.z);
        scene.add(trunk);
        colliders.push(trunk);
        
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x006400 }));
        leaf.position.set(t.x, 6, t.z);
        scene.add(leaf);
    });
}

// --- Inputs ---
const keys = { w: false, a: false, s: false, d: false, space: false };

document.addEventListener('keydown', (e) => {
    switch(e.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
        case 'Space': keys.space = true; break;
        case 'KeyR': reload(); break;
    }
});
document.addEventListener('keyup', (e) => {
    switch(e.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
        case 'Space': keys.space = false; break;
    }
});

document.addEventListener('mousemove', (e) => {
    if (!isLocked) return;
    // Rotate Body (Left/Right)
    playerMesh.rotation.y -= e.movementX * 0.002;
    
    // Rotate Camera (Up/Down)
    pitchObject.rotation.x -= e.movementY * 0.002;
    
    // Clamp Up/Down look so you don't break your neck
    pitchObject.rotation.x = Math.max(-1.0, Math.min(1.0, pitchObject.rotation.x));
});

document.addEventListener('mousedown', () => { if (isLocked && !isReloading && ammo > 0) shoot(); });

document.getElementById('start-screen').addEventListener('click', () => {
    document.body.requestPointerLock();
    document.getElementById('start-screen').style.display = 'none';
});
document.addEventListener('pointerlockchange', () => isLocked = document.pointerLockElement === document.body);

function reload() {
    if (isReloading || ammo === 20) return;
    isReloading = true;
    document.getElementById('reload-msg').style.display = 'block';
    setTimeout(() => {
        ammo = 20;
        document.getElementById('ammo-current').innerText = ammo;
        isReloading = false;
        document.getElementById('reload-msg').style.display = 'none';
    }, 2000);
}

function shoot() {
    ammo--;
    document.getElementById('ammo-current').innerText = ammo;
    socket.emit('shoot');
}

function checkCollision(position) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(position, new THREE.Vector3(1, 2, 1)); 
    for (let i = 0; i < colliders.length; i++) {
        const wallBox = new THREE.Box3().setFromObject(colliders[i]);
        if (playerBox.intersectsBox(wallBox)) return true;
    }
    return false;
}

// --- Multiplayer ---
socket.on('init', (data) => {
    myId = data.id;
    buildWorld(data.map);
    // Note: We don't spawn ourselves from server list, we spawn local model above
    for (let id in data.players) {
        if (id !== myId) spawnOtherPlayer(id, data.players[id]);
    }
});

socket.on('playerJoined', (d) => spawnOtherPlayer(d.id, d.data));
socket.on('playerMoved', (d) => {
    if (players[d.id]) {
        players[d.id].position.set(d.data.x, d.data.y, d.data.z);
        players[d.id].rotation.y = d.data.rotation;
    }
});
socket.on('playerLeft', (id) => { if (players[id]) { scene.remove(players[id]); delete players[id]; } });

function spawnOtherPlayer(id, data) {
    if (loadedModel) {
        const p = loadedModel.clone();
        p.position.set(data.x, data.y, data.z);
        p.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE); // Ensure scale matches
        p.rotation.y = Math.PI; 
        scene.add(p);
        players[id] = p;
    } else {
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshBasicMaterial( {color: 0xff0000} );
        const cube = new THREE.Mesh( geometry, material );
        cube.position.set(data.x, data.y, data.z);
        scene.add( cube );
        players[id] = cube;
    }
}

// --- Main Loop ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (isLocked) {
        const delta = clock.getDelta();

        const moveDir = new THREE.Vector3();
        if (keys.w) moveDir.z -= 1;
        if (keys.s) moveDir.z += 1;
        if (keys.a) moveDir.x -= 1;
        if (keys.d) moveDir.x += 1;
        moveDir.normalize();
        moveDir.applyEuler(new THREE.Euler(0, playerMesh.rotation.y, 0));

        velocity.x = moveDir.x * PLAYER_SPEED;
        velocity.z = moveDir.z * PLAYER_SPEED;
        velocity.y -= gravity * delta; 

        if (keys.space && canJump) {
            velocity.y = JUMP_FORCE;
            canJump = false;
        }

        playerMesh.position.x += velocity.x * delta;
        if (checkCollision(playerMesh.position)) playerMesh.position.x -= velocity.x * delta;

        playerMesh.position.z += velocity.z * delta;
        if (checkCollision(playerMesh.position)) playerMesh.position.z -= velocity.z * delta;

        playerMesh.position.y += velocity.y * delta;
        
        // Ground Check
        if (playerMesh.position.y < 0) {
            playerMesh.position.y = 0;
            velocity.y = 0;
            canJump = true;
        }
        
        // Roof/Ceiling Check
        if (checkCollision(playerMesh.position)) {
            if (velocity.y < 0) {
                playerMesh.position.y -= velocity.y * delta;
                velocity.y = 0;
                canJump = true;
            } else {
                playerMesh.position.y -= velocity.y * delta;
                velocity.y = 0;
            }
        }

        socket.emit('move', {
            x: playerMesh.position.x,
            y: playerMesh.position.y,
            z: playerMesh.position.z,
            rotation: playerMesh.rotation.y
        });
    }
    
    renderer.render(scene, camera);
}
animate();
