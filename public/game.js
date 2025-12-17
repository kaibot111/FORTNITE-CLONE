const socket = io();

// --- GUI SETTINGS ---
const params = {
    scale: 0.005,       // Controls size of the model
    camOffsetY: 4.0,    // Controls height of the camera (Manual)
    camOffsetZ: 8.0,    // Controls distance behind player
    speed: 15.0,
    jumpForce: 25.0,
    gravity: 50.0
};

// --- GUI SETUP ---
const gui = new dat.GUI();
const f1 = gui.addFolder('Player Settings');

// 1. Model Scale: Only changes the size of the 3D model
f1.add(params, 'scale', 0.0001, 0.02).step(0.0001).name('Model Size').onChange(updateModelScale);

// 2. Camera Controls: Manual adjustment
f1.add(params, 'camOffsetY', 0, 20).name('Camera Height').onChange(updateCameraRig);
f1.add(params, 'camOffsetZ', 2, 30).name('Camera Dist').onChange(updateCameraRig);

f1.add(params, 'speed', 5, 50).name('Run Speed');
f1.add(params, 'jumpForce', 10, 100).name('Jump Force');
f1.open();

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, 200);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding; 
document.body.appendChild(renderer.domElement);

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
let myPlayerModel = null; 

let velocity = new THREE.Vector3();
let canJump = false;

// --- PLAYER CONTAINER ---
const playerMesh = new THREE.Group();
scene.add(playerMesh);

// --- CAMERA RIG ---
const pitchObject = new THREE.Object3D();
playerMesh.add(pitchObject);
pitchObject.add(camera);

// Initialize Camera Position
updateCameraRig();

// --- UPDATE FUNCTIONS ---

function updateModelScale() {
    if (myPlayerModel) {
        // Directly set the scale of the mesh
        myPlayerModel.scale.set(params.scale, params.scale, params.scale);
    }
}

function updateCameraRig() {
    // 1. Move the pivot up/down (Neck height)
    pitchObject.position.y = params.camOffsetY;
    
    // 2. Move the camera back (Distance)
    // We do NOT use lookAt(0,0,0) here because it breaks rotation.
    // The camera naturally looks forward (-Z).
    camera.position.set(0, 0, params.camOffsetZ);
}

// --- FBX LOADER ---
const loader = new THREE.FBXLoader();

loader.load('samurai-vader.fbx', (object) => {
    console.log("FBX Model Loaded!");
    loadedModel = object;
    
    const myFigure = loadedModel.clone();
    myFigure.position.y = -1; // Feet adjustment
    myFigure.rotation.y = Math.PI; // Face forward
    
    // Set initial scale from params
    myFigure.scale.set(params.scale, params.scale, params.scale);

    // Save reference and add to group
    myPlayerModel = myFigure;
    playerMesh.add(myFigure);

}, undefined, (error) => {
    console.error('Error loading model:', error);
});

// --- World Builder ---
function buildWorld(mapData) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    mapData.buildings.forEach(b => {
        const mat = new THREE.MeshStandardMaterial({ color: b.type === 'barn' ? 0x8B4513 : 0x808080 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(b.x, b.h / 2, b.z);
        mesh.scale.set(8, b.h, 8);
        scene.add(mesh);
        mesh.updateMatrixWorld(); 
        colliders.push(mesh);
    });

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
    playerMesh.rotation.y -= e.movementX * 0.002;
    pitchObject.rotation.x -= e.movementY * 0.002;
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
    for (let id in data.players) {
        if (id !== myId) spawnOtherPlayer(id, data.players[id]);
    }
});

socket.on('playerJoined', (d) => spawnOtherPlayer(d.id, d.data));
socket.on('playerMoved', (d) => {
    if (players[d.id]) {
        players[d.id].position.set(d.data.x, d.data.y, d.data.z);
        players[d.id].rotation.y = d.data.rotation;
        // Sync scale for others if they are models
        if(players[d.id].isModel) players[d.id].scale.set(params.scale, params.scale, params.scale);
    }
});
socket.on('playerLeft', (id) => { if (players[id]) { scene.remove(players[id]); delete players[id]; } });

function spawnOtherPlayer(id, data) {
    if (loadedModel) {
        const p = loadedModel.clone();
        p.position.set(data.x, data.y, data.z);
        p.scale.set(params.scale, params.scale, params.scale);
        p.rotation.y = Math.PI; 
        p.isModel = true;
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

        velocity.x = moveDir.x * params.speed;
        velocity.z = moveDir.z * params.speed;
        velocity.y -= params.gravity * delta; 

        if (keys.space && canJump) {
            velocity.y = params.jumpForce;
            canJump = false;
        }

        playerMesh.position.x += velocity.x * delta;
        if (checkCollision(playerMesh.position)) playerMesh.position.x -= velocity.x * delta;

        playerMesh.position.z += velocity.z * delta;
        if (checkCollision(playerMesh.position)) playerMesh.position.z -= velocity.z * delta;

        playerMesh.position.y += velocity.y * delta;
        
        if (playerMesh.position.y < 0) {
            playerMesh.position.y = 0;
            velocity.y = 0;
            canJump = true;
        }
        
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
