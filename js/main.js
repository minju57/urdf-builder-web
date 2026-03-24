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
  container.innerHTML = `<div style="overflow-x: auto; padding: 10px; text-align: center; min-height: 120px;">${svg}</div>`;
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
        resolve(data);
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
        resolve(normalized);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('Unsupported file type: ' + ext));
    }
  });
}

function generateInertiaTemplate() {
  const headers = ['link_name', 'mass', 'ixx', 'iyy', 'izz', 'ixy', 'ixz', 'iyz', 'com_x', 'com_y', 'com_z'];
  const example = [
    ['base_link', 5.0, 0.01, 0.01, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1],
    ['link_0', 2.0, 0.005, 0.005, 0.005, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05]
  ];

  // Add rows for current joints
  AppState.joints.forEach((j, i) => {
    if (i >= 1) {
      example.push([j.child, 1.0, 0.001, 0.001, 0.001, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inertia');
  XLSX.writeFile(wb, 'inertia_template.xlsx');
}

// ==================== URDF Download ====================

function generateAndDownloadURDF() {
  const robotName = document.getElementById('robot_name_input').value.trim() || 'my_robot';
  const urdfStr = generateURDF(AppState.joints, robotName, AppState.baseState, AppState.inertiaData, AppState.isImported);

  const blob = new Blob([urdfStr], { type: 'text/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${robotName}.urdf`;
  a.click();
  URL.revokeObjectURL(url);

  // Show preview - open the details panel automatically
  const preview = document.getElementById('urdf_preview');
  if (preview) {
    preview.textContent = urdfStr;
    const detailsEl = preview.closest('details');
    if (detailsEl) detailsEl.open = true;
  }
  showToast('URDF generated and downloaded.');
}

// ==================== Visualizer panel ====================

let vizJointValues = [];
let vizMeshMap = {};

function renderVisualizerSliders(movableJoints) {
  const panel = document.getElementById('viz_sliders_panel');
  if (!panel) return;

  vizJointValues = movableJoints.map(() => 0);

  if (movableJoints.length === 0) {
    panel.innerHTML = '<div class="empty-state">No movable joints found.</div>';
    return;
  }

  let html = '<div class="slider-list">';
  movableJoints.forEach((j, i) => {
    html += `
<div class="slider-item">
  <label>${escH(j.name)} <span class="slider-val" id="slider_val_${i}">0.0°</span></label>
  <input type="range" id="joint_slider_${i}" min="${j.min.toFixed(1)}" max="${j.max.toFixed(1)}" step="0.5" value="0"
    oninput="onSliderChange(${i}, this.value)">
  <span class="slider-range">${j.min.toFixed(0)}° ~ ${j.max.toFixed(0)}°</span>
</div>`;
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

  // Generate URDF
  document.getElementById('btn_generate_urdf').addEventListener('click', () => {
    generateAndDownloadURDF();
  });

  // ---- Visualizer tab ----

  Visualizer.setup('viz_canvas');

  // Load URDF to viewer
  const vizUrdfUpload = document.getElementById('viz_urdf_upload');
  vizUrdfUpload.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const urdfFile = files.find(f => f.name.toLowerCase().endsWith('.urdf'));
    const meshFiles = files.filter(f => !f.name.toLowerCase().endsWith('.urdf'));

    if (!urdfFile) {
      // Try to use currently built URDF
      showToast('No .urdf file selected. Use "Load Current URDF" button.', 'error');
      return;
    }

    // Read mesh files into meshMap
    const meshMap = {};
    for (const f of meshFiles) {
      const key = f.name.toLowerCase();
      const ext = key.split('.').pop();
      const data = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result);
        if (ext === 'obj') reader.readAsText(f);
        else reader.readAsDataURL(f);
      });

      if (ext === 'obj') {
        meshMap[key] = { type: 'obj', data };
      } else {
        // Strip data URL prefix for base64
        const base64 = data.split(',')[1] || data;
        meshMap[key] = { type: 'stl', data: base64 };
      }
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const movableJoints = Visualizer.loadURDF(ev.target.result, meshMap);
      renderVisualizerSliders(movableJoints);
      showToast('URDF loaded in visualizer.');
    };
    reader.readAsText(urdfFile);
    vizUrdfUpload.value = '';
  });

  // Load current URDF button
  document.getElementById('btn_viz_load_current').addEventListener('click', () => {
    const robotName = document.getElementById('robot_name_input').value.trim() || 'my_robot';
    const urdfStr = generateURDF(AppState.joints, robotName, AppState.baseState, AppState.inertiaData, AppState.isImported);
    const movableJoints = Visualizer.loadURDF(urdfStr, {});
    renderVisualizerSliders(movableJoints);
    showToast('Current robot loaded in visualizer.');
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

  // Instructions accordion
  const instrHeader = document.getElementById('instructions_header');
  const instrBody = document.getElementById('instructions_body');
  if (instrHeader && instrBody) {
    instrHeader.addEventListener('click', () => toggleAccordion('instructions_body'));
  }
});
