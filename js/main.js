// main.js - Application bootstrap and event wiring

// ==================== UI Rendering ====================

function renderJointDropdown() {
  const joints = AppState.joints;
  const sel = AppState.selectedIndex;

  let html = '<option value="-1">-- Select Joint --</option>';
  joints.forEach((j, i) => {
    html += `<option value="${i}" ${i === sel ? 'selected' : ''}>${i}: ${escH(j.name)}</option>`;
  });

  const dd = document.getElementById('joint_dropdown');
  if (dd) dd.innerHTML = html;

  // Order list
  let olHtml = '';
  joints.forEach((j, i) => {
    olHtml += `<div class="order-item ${i === sel ? 'selected' : ''}" data-joint-idx="${i}">${i}: ${escH(j.name)} [${j.axis || ''}]</div>`;
  });
  const ol = document.getElementById('order_list');
  if (ol) ol.innerHTML = olHtml;
}

function renderTree() {
  const container = document.getElementById('tree_container');
  if (!container) return;
  const svg = drawTree(AppState.joints, AppState.selectedIndex, AppState.baseState);
  container.innerHTML = `<div style="padding: 10px; display: inline-block;">${svg}</div>`;
}

function initTreePan(container) {
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;

  container.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-joint-idx]')) return;
    isDragging = true;
    container.style.cursor = 'grabbing';
    startX = e.pageX - container.offsetLeft;
    startY = e.pageY - container.offsetTop;
    scrollLeft = container.scrollLeft;
    scrollTop = container.scrollTop;
    e.preventDefault();
  });

  container.addEventListener('mouseleave', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = e.pageX - container.offsetLeft;
    const y = e.pageY - container.offsetTop;
    container.scrollLeft = scrollLeft - (x - startX);
    container.scrollTop = scrollTop - (y - startY);
  });
}

function renderEditor() {
  const editorPanel = document.getElementById('editor_panel');
  if (!editorPanel) return;

  const idx = AppState.selectedIndex;

  if (idx === -3 && AppState.baseState && !AppState.baseState.no_base) {
    // Show base editor
    editorPanel.innerHTML = renderBaseEditor(AppState.baseState);
    editorPanel.style.display = '';
    attachBaseEditorListeners();
    attachBaseEditorButtons();
  } else if (idx >= 0 && idx < AppState.joints.length) {
    // Show joint editor
    editorPanel.innerHTML = renderJointEditor(AppState.joints[idx], AppState.joints);
    editorPanel.style.display = '';
    attachJointEditorListeners();
    attachJointEditorButtons(idx);
  } else {
    editorPanel.innerHTML = '<div class="editor-placeholder">Select a joint from the tree or dropdown to edit it.</div>';
    editorPanel.style.display = '';
  }
}

// ==================== Button Listeners ====================

function attachJointEditorButtons(idx) {
  const applyBtn = document.getElementById('btn_apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const values = getJointFromForm();
      AppState.applyJointChanges(idx, values);
      showToast('Joint applied.');
    });
  }

  const closeBtn = document.getElementById('btn_close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      AppState.setSelected(-1);
    });
  }

  const deleteBtn = document.getElementById('btn_delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete joint "${AppState.joints[idx].name}"?`)) {
        AppState.deleteJoint(idx);
      }
    });
  }
}

function attachBaseEditorButtons() {
  const applyBtn = document.getElementById('btn_base_apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const values = getBaseFromForm();
      AppState.applyBaseChanges(values);
      showToast('Base joint applied.');
    });
  }

  const closeBtn = document.getElementById('btn_base_close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      AppState.setSelected(-1);
    });
  }
}

// ==================== Toast notification ====================

function showToast(msg, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// ==================== Full UI re-render ====================

function refreshUI() {
  renderTree();
  renderJointDropdown();
  renderEditor();
}

// ==================== Tab switching ====================

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.getElementById(target);
      if (content) content.classList.add('active');

      if (target === 'tab_visualizer') {
        // Give Three.js a moment to get container dimensions
        setTimeout(() => {
          if (Visualizer.renderer) Visualizer.fitCamera();
        }, 100);
      }
    });
  });
}

// ==================== Inertia file handling ====================

function convertInertiaUnits(data) {
  // mm → m: CoM ÷ 1000, inertia tensor ÷ 1e6, mass unchanged
  return data.map(row => {
    const r = Object.assign({}, row);
    ['com_x', 'com_y', 'com_z', 'x', 'y', 'z'].forEach(k => {
      if (k in r) r[k] = r[k] / 1000.0;
    });
    ['ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz'].forEach(k => {
      if (k in r) r[k] = r[k] / 1e6;
    });
    return r;
  });
}

function readInertiaFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length === 0) return resolve([]);
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const data = [];
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(',').map(v => v.trim());
          if (vals.length === 0) continue;
          const row = {};
          headers.forEach((h, j) => { row[h] = vals[j] || ''; });
          data.push(row);
        }
        // Convert numeric fields
        data.forEach(row => {
          ['mass', 'm', 'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz', 'com_x', 'com_y', 'com_z', 'x', 'y', 'z'].forEach(k => {
            if (k in row) row[k] = parseFloat(row[k]) || 0;
          });
        });
        resolve(convertInertiaUnits(data));
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: 0 });
        // Normalize header keys to lowercase
        const normalized = json.map(row => {
          const newRow = {};
          Object.keys(row).forEach(k => { newRow[k.toLowerCase().trim()] = row[k]; });
          return newRow;
        });
        resolve(convertInertiaUnits(normalized));
      };
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('Unsupported file type: ' + ext));
    }
  });
}

function generateInertiaTemplate() {
  // Always mm units: mass(kg), inertia(kg·mm²), com(mm)
  const headers = ['link_name', 'mass', 'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz', 'com_x', 'com_y', 'com_z'];

  const baseLinkName = (AppState.baseState && AppState.baseState.child) ? AppState.baseState.child : 'base_link';
  const example = [
    [baseLinkName, 5.0, 10000, 10000, 10000, 0.0, 0.0, 0.0, 0.0, 0.0, 100],
  ];

  AppState.joints.forEach((j) => {
    example.push([j.child, 1.0, 1000, 1000, 1000, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inertia(kg,mm)');
  XLSX.writeFile(wb, 'inertia_template_mm.xlsx');
}

// ==================== URDF Download ====================

let _lastGeneratedURDF = null;
let _lastGeneratedRobotName = null;

function generateURDFPreview() {
  const robotName = document.getElementById('robot_name_input').value.trim() || 'my_robot';
  const urdfStr = generateURDF(AppState.joints, robotName, AppState.baseState, AppState.inertiaData, AppState.isImported);

  _lastGeneratedURDF = urdfStr;
  _lastGeneratedRobotName = robotName;

  const preview = document.getElementById('urdf_preview');
  if (preview) preview.textContent = urdfStr;

  const dlBtn = document.getElementById('btn_download_urdf');
  if (dlBtn) dlBtn.disabled = false;

  showToast('URDF generated. Click Download to save.');
}

function downloadURDF() {
  if (!_lastGeneratedURDF) return;
  const blob = new Blob([_lastGeneratedURDF], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${_lastGeneratedRobotName || 'my_robot'}.urdf`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('URDF downloaded.');
}

// ==================== Visualizer panel ====================

let vizJointValues = [];
let vizMeshMap = {};

function renderVisualizerSliders(movableJoints) {
  const panel = document.getElementById('viz_sliders_panel');
  if (!panel) return;

  vizJointValues = movableJoints.map(() => 0);

  // Build index map: joint name → slider index (for movable joints)
  const movableIndexMap = {};
  movableJoints.forEach((j, i) => { movableIndexMap[j.name] = i; });

  // Get ALL joints in kinematic tree order (fixed + movable)
  const allJoints = Visualizer.getAllJointsInOrder();

  if (allJoints.length === 0) {
    panel.innerHTML = '<div class="empty-state">No joints found.</div>';
    return;
  }

  let html = '<div class="slider-list">';
  allJoints.forEach(j => {
    const cbId = `frame_cb_${j.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const hasFrame = !!Visualizer.jointAxes[j.name];
    const isMovable = j.name in movableIndexMap;
    const i = movableIndexMap[j.name];

    if (isMovable) {
      html += `
<div class="slider-item">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <label>${escH(j.name)} <span class="slider-val" id="slider_val_${i}">0.0°</span></label>
    ${hasFrame ? `<label style="display:flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;">
      <input type="checkbox" id="${cbId}" onchange="Visualizer.setJointAxisVisible('${escH(j.name)}', this.checked)"> Frame
    </label>` : ''}
  </div>
  <input type="range" id="joint_slider_${i}" min="${j.min.toFixed(1)}" max="${j.max.toFixed(1)}" step="0.5" value="0"
    oninput="onSliderChange(${i}, this.value)">
  <span class="slider-range">${j.min.toFixed(0)}° ~ ${j.max.toFixed(0)}°</span>
</div>`;
    } else {
      html += `
<div class="slider-item" style="opacity:0.65;">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <label style="font-size:11px;">${escH(j.name)} <span style="color:#999;">[fixed]</span></label>
    ${hasFrame ? `<label style="display:flex;align-items:center;gap:3px;font-size:11px;cursor:pointer;">
      <input type="checkbox" id="${cbId}" onchange="Visualizer.setJointAxisVisible('${escH(j.name)}', this.checked)"> Frame
    </label>` : ''}
  </div>
</div>`;
    }
  });
  html += '</div>';
  html += '<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="resetAllJoints()">Reset All</button>';
  panel.innerHTML = html;
}

function onSliderChange(i, val) {
  vizJointValues[i] = parseFloat(val);
  const lbl = document.getElementById(`slider_val_${i}`);
  if (lbl) lbl.textContent = parseFloat(val).toFixed(1) + '°';
  Visualizer.updateJointPose(vizJointValues);
}

function resetAllJoints() {
  vizJointValues = vizJointValues.map(() => 0);
  document.querySelectorAll('[id^="joint_slider_"]').forEach((el, i) => {
    el.value = 0;
    const lbl = document.getElementById(`slider_val_${i}`);
    if (lbl) lbl.textContent = '0.0°';
  });
  Visualizer.updateJointPose(vizJointValues);
}

// ==================== Escape HTML ====================

function escH(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== Main init ====================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize state
  AppState.baseState = getDefaultBaseJoint();
  AppState.joints = [getDefaultJoint(0)];
  AppState.selectedIndex = -1;

  // State subscriptions
  AppState.subscribe((event) => {
    if (event === 'joints' || event === 'selected' || event === 'base') {
      renderTree();
      renderJointDropdown();
      renderEditor();
    }
  });

  initTabs();
  refreshUI();

  // Tree pan — attach once, not on every renderTree()
  const treeContainer = document.getElementById('tree_container');
  if (treeContainer) initTreePan(treeContainer);

  // ---- Builder tab events ----

  // Add Joint button
  document.getElementById('btn_add_joint').addEventListener('click', () => {
    AppState.addJoint();
  });

  // Move Up / Down
  document.getElementById('btn_move_up').addEventListener('click', () => {
    AppState.moveUp(AppState.selectedIndex);
  });
  document.getElementById('btn_move_down').addEventListener('click', () => {
    AppState.moveDown(AppState.selectedIndex);
  });

  // Reset All Joints
  document.getElementById('btn_reset_all').addEventListener('click', () => {
    if (!confirm('Reset all joints to initial state? This cannot be undone.')) return;
    AppState.joints = [getDefaultJoint(0)];
    AppState.selectedIndex = -1;
    AppState.inertiaData = null;
    AppState.isImported = false;
    document.getElementById('inertia_status').textContent = '';
    AppState.emit('joints');
    AppState.emit('selected');
    showToast('All joints reset.');
  });

  // Joint dropdown
  document.getElementById('joint_dropdown').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    AppState.setSelected(isNaN(val) ? -1 : val);
  });

  // Order list clicks (event delegation)
  document.getElementById('order_list').addEventListener('click', (e) => {
    const item = e.target.closest('.order-item');
    if (item) {
      const idx = parseInt(item.getAttribute('data-joint-idx'));
      if (!isNaN(idx)) AppState.setSelected(idx);
    }
  });

  // Tree diagram clicks (event delegation on document)
  document.addEventListener('click', (e) => {
    const node = e.target.closest('[data-joint-idx]');
    if (node) {
      const container = document.getElementById('tree_container');
      if (container && container.contains(node)) {
        const idx = parseInt(node.getAttribute('data-joint-idx'));
        if (!isNaN(idx)) {
          AppState.setSelected(idx);
        }
      }
    }
  });

  // URDF import
  const urdfUpload = document.getElementById('urdf_upload');
  urdfUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { joints, baseJoint } = parseURDF(ev.target.result);
        AppState.joints = joints;
        AppState.selectedIndex = -1;
        if (baseJoint && !baseJoint.no_base) {
          AppState.baseState = baseJoint;
        } else if (baseJoint && baseJoint.no_base) {
          AppState.baseState = Object.assign(getDefaultBaseJoint(), { no_base: true });
        }
        AppState.isImported = true;
        AppState.emit('joints');
        AppState.emit('selected');
        AppState.emit('base');
        showToast(`Imported ${joints.length} joints from ${file.name}`);
      } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    urdfUpload.value = '';
  });

  // Inertia file upload
  const inertiaUpload = document.getElementById('inertia_upload');
  inertiaUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    readInertiaFile(file).then(data => {
      AppState.inertiaData = data;
      showToast(`Loaded ${data.length} inertia rows from ${file.name}`);
      document.getElementById('inertia_status').textContent = `Loaded: ${file.name} (${data.length} rows)`;
    }).catch(err => {
      showToast('Inertia load failed: ' + err.message, 'error');
    });
    inertiaUpload.value = '';
  });

  // Download inertia template
  document.getElementById('btn_inertia_template').addEventListener('click', () => {
    generateInertiaTemplate();
  });

  // Generate URDF (preview only)
  document.getElementById('btn_generate_urdf').addEventListener('click', () => {
    generateURDFPreview();
  });

  // Download URDF
  document.getElementById('btn_download_urdf').addEventListener('click', () => {
    downloadURDF();
  });

  // ---- Visualizer tab ----

  Visualizer.setup('viz_canvas');

  // Visualizer file accumulation state
  let vizUrdfFile = null;
  let vizMeshFiles = {};  // filename → {type, data}

  function updateVizFileStatus() {
    const status = document.getElementById('viz_file_status');
    const loadBtn = document.getElementById('btn_viz_load');
    const lines = [];
    if (vizUrdfFile) lines.push(`URDF: ${vizUrdfFile.name}`);
    else lines.push('URDF: 없음');
    const meshCount = Object.keys(vizMeshFiles).length;
    if (meshCount > 0) lines.push(`Mesh: ${meshCount}개 (${Object.keys(vizMeshFiles).join(', ')})`);
    status.textContent = lines.join(' | ');
    loadBtn.disabled = !vizUrdfFile;
  }

  // URDF upload
  document.getElementById('viz_urdf_upload').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    vizUrdfFile = f;
    updateVizFileStatus();
    e.target.value = '';
  });

  // Mesh upload (accumulate)
  document.getElementById('viz_mesh_upload').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const key = f.name.toLowerCase();
      const ext = key.split('.').pop();
      const data = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result);
        if (ext === 'obj') reader.readAsText(f);
        else reader.readAsDataURL(f);
      });
      if (ext === 'obj') {
        vizMeshFiles[key] = { type: 'obj', data };
      } else {
        vizMeshFiles[key] = { type: 'stl', data: data.split(',')[1] || data };
      }
    }
    updateVizFileStatus();
    e.target.value = '';
  });

  // Load button
  document.getElementById('btn_viz_load').addEventListener('click', () => {
    if (!vizUrdfFile) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const movableJoints = Visualizer.loadURDF(ev.target.result, vizMeshFiles);
      renderVisualizerSliders(movableJoints);
      showToast('URDF loaded in visualizer.');
    };
    reader.readAsText(vizUrdfFile);
  });

  // Clear files
  document.getElementById('btn_viz_clear_files').addEventListener('click', () => {
    vizUrdfFile = null;
    vizMeshFiles = {};
    updateVizFileStatus();
    showToast('Files cleared.');
  });

  // Fit camera
  document.getElementById('btn_viz_fit').addEventListener('click', () => {
    Visualizer.fitCamera();
  });

  // Toggle visual
  document.getElementById('viz_show_visual').addEventListener('change', (e) => {
    Visualizer.toggleVisual(e.target.checked);
  });

  // Toggle collision
  document.getElementById('viz_show_collision').addEventListener('change', (e) => {
    Visualizer.toggleCollision(e.target.checked);
  });

  // Instructions accordion (single listener — no onclick in HTML)
  document.getElementById('instructions_header').addEventListener('click', () => {
    toggleAccordion('instructions_body');
  });
});
