// editor.js - Editor rendering and form handling

// --- Visibility logic (port from builder_tab.py update_vis_ui / update_col_ui) ---

function getVisUIState(vType) {
  const isMesh = (vType === 'Mesh');
  const isAuto = vType.includes('Auto');
  const isNone = (vType === 'None');

  if (isAuto || isNone) {
    return {
      showMesh: false,
      showDims: false,
      showOffset: false,
      dim1Label: 'Dim 1', dim2Label: 'Dim 2', dim3Label: 'Dim 3',
      showDim1: false, showDim2: false, showDim3: false
    };
  }

  const showDims = !isMesh;
  let dim1Label = 'Dim 1', dim2Label = 'Dim 2', dim3Label = 'Dim 3';
  let showDim1 = false, showDim2 = false, showDim3 = false;

  if (showDims) {
    const shape = vType.includes('(') ? vType.split('(')[1].replace(')', '').trim() : vType;
    if (shape.includes('Sphere')) {
      dim1Label = 'Radius'; showDim1 = true;
    } else if (shape.includes('Cylinder')) {
      dim1Label = 'Radius'; dim2Label = 'Length'; showDim1 = true; showDim2 = true;
    } else if (shape.includes('Box')) {
      dim1Label = 'X'; dim2Label = 'Y'; dim3Label = 'Z';
      showDim1 = true; showDim2 = true; showDim3 = true;
    }
  }

  return {
    showMesh: isMesh,
    showDims, showOffset: true,
    dim1Label, dim2Label, dim3Label,
    showDim1, showDim2, showDim3
  };
}

function getColUIState(enabled, cType) {
  if (!enabled) {
    return {
      showInner: false, showTypeRow: false, showOffset: false,
      dim1Label: 'Dim 1', dim2Label: 'Dim 2', dim3Label: 'Dim 3',
      showDim1: false, showDim2: false, showDim3: false
    };
  }

  let dim1Label = 'Dim 1', dim2Label = 'Dim 2', dim3Label = 'Dim 3';
  let showDim1 = false, showDim2 = false, showDim3 = false;

  if (cType === 'Sphere') {
    dim1Label = 'Radius'; showDim1 = true;
  } else if (cType === 'Cylinder') {
    dim1Label = 'Radius'; dim2Label = 'Length'; showDim1 = true; showDim2 = true;
  } else if (cType === 'Box') {
    dim1Label = 'X'; dim2Label = 'Y'; dim3Label = 'Z';
    showDim1 = true; showDim2 = true; showDim3 = true;
  }

  return {
    showInner: true, showTypeRow: true, showOffset: true,
    dim1Label, dim2Label, dim3Label,
    showDim1, showDim2, showDim3
  };
}

// Helper: apply visibility state to editor elements
function applyVisState(prefix, state) {
  const setV = (id, vis) => {
    const el = document.getElementById(id);
    if (el) el.style.display = vis ? '' : 'none';
  };
  const setLabel = (id, label) => {
    const el = document.getElementById(id);
    if (el) {
      const lbl = el.closest('.form-group') ? el.closest('.form-group').querySelector('label') : null;
      if (lbl) lbl.textContent = label;
    }
  };

  setV(`${prefix}_vis_mesh_row`, state.showMesh);
  setV(`${prefix}_vis_dims_row`, state.showDims || state.showDim1);
  setV(`${prefix}_vis_offset_row`, state.showOffset);
  setV(`${prefix}_vis_d1_group`, state.showDim1);
  setV(`${prefix}_vis_d2_group`, state.showDim2);
  setV(`${prefix}_vis_d3_group`, state.showDim3);

  const d1lbl = document.querySelector(`#${prefix}_vis_d1_group label`);
  const d2lbl = document.querySelector(`#${prefix}_vis_d2_group label`);
  const d3lbl = document.querySelector(`#${prefix}_vis_d3_group label`);
  if (d1lbl) d1lbl.textContent = state.dim1Label;
  if (d2lbl) d2lbl.textContent = state.dim2Label;
  if (d3lbl) d3lbl.textContent = state.dim3Label;
}

function applyColState(prefix, state) {
  const setV = (id, vis) => {
    const el = document.getElementById(id);
    if (el) el.style.display = vis ? '' : 'none';
  };
  setV(`${prefix}_col_inner`, state.showInner);
  setV(`${prefix}_col_dims_row`, state.showDim1);
  setV(`${prefix}_col_offset_row`, state.showOffset);

  const d1lbl = document.querySelector(`#${prefix}_col_d1_group label`);
  const d2lbl = document.querySelector(`#${prefix}_col_d2_group label`);
  const d3lbl = document.querySelector(`#${prefix}_col_d3_group label`);
  if (d1lbl) d1lbl.textContent = state.dim1Label;
  if (d2lbl) d2lbl.textContent = state.dim2Label;
  if (d3lbl) d3lbl.textContent = state.dim3Label;

  const d1g = document.getElementById(`${prefix}_col_d1_group`);
  const d2g = document.getElementById(`${prefix}_col_d2_group`);
  const d3g = document.getElementById(`${prefix}_col_d3_group`);
  if (d1g) d1g.style.display = state.showDim1 ? '' : 'none';
  if (d2g) d2g.style.display = state.showDim2 ? '' : 'none';
  if (d3g) d3g.style.display = state.showDim3 ? '' : 'none';
}

// --- Render joint editor ---

function renderJointEditor(joint, joints) {
  if (!joint) return '';

  const parentOptions = ['base_link', ...joints.filter(j => j !== joint).map(j => j.child)];
  const parentSelect = parentOptions.map(p =>
    `<option value="${escH(p)}" ${p === joint.parent ? 'selected' : ''}>${escH(p)}</option>`
  ).join('');

  const visState = getVisUIState(joint.vis_type || 'Auto (Cylinder)');
  const colState = getColUIState(joint.col_enabled, joint.col_type || 'Cylinder');

  const axisOptions = ['Roll', 'Pitch', 'Yaw', 'Fixed'];
  const currentAxis = joint.type === 'fixed' ? 'Fixed' : (joint.axis || 'Roll');
  const axisRadios = axisOptions.map(a =>
    `<label class="radio-label"><input type="radio" name="ed_axis" value="${a}" ${a === currentAxis ? 'checked' : ''}> ${a}</label>`
  ).join(' ');

  const visTypeOptions = ['Auto (Cylinder)', 'Auto (Box)', 'Manual (Cylinder)', 'Manual (Box)', 'Manual (Sphere)', 'Mesh'];
  const visTypeRadios = visTypeOptions.map(v =>
    `<label class="radio-label"><input type="radio" name="ed_vis_type" value="${escH(v)}" ${v === (joint.vis_type || 'Auto (Cylinder)') ? 'checked' : ''}> ${escH(v)}</label>`
  ).join(' ');

  const colTypeOptions = ['Cylinder', 'Box', 'Sphere'];
  const colTypeSelect = colTypeOptions.map(c =>
    `<option value="${c}" ${c === (joint.col_type || 'Cylinder') ? 'selected' : ''}>${c}</option>`
  ).join('');

  const limitVisible = currentAxis !== 'Fixed';

  return `
<div class="editor-header">
  <span class="editor-title">Editing: ${escH(joint.name)}</span>
  <div class="editor-actions">
    <button class="btn btn-primary btn-sm" id="btn_apply">Apply</button>
    <button class="btn btn-secondary btn-sm" id="btn_close">Close</button>
    <button class="btn btn-danger btn-sm" id="btn_delete">Delete</button>
  </div>
</div>

<div class="form-row">
  <div class="form-group">
    <label>Joint Name</label>
    <input type="text" id="ed_name" value="${escH(joint.name)}">
  </div>
  <div class="form-group">
    <label>Parent Link</label>
    <select id="ed_parent">${parentSelect}</select>
  </div>
  <div class="form-group">
    <label>Child Link</label>
    <input type="text" id="ed_child" value="${escH(joint.child)}">
  </div>
</div>

<div class="accordion">
  <div class="accordion-header" onclick="toggleAccordion('kinematics_section')">
    <span>Kinematics</span><span class="accordion-arrow">&#9660;</span>
  </div>
  <div class="accordion-body" id="kinematics_section">
    <div class="form-group">
      <label>Axis / Type</label>
      <div class="radio-group">${axisRadios}</div>
    </div>
    <div class="form-row" id="ed_offset_row">
      <div class="form-group"><label>Off X (mm)</label><input type="number" id="ed_x" step="any" value="${joint.x || 0}"></div>
      <div class="form-group"><label>Off Y (mm)</label><input type="number" id="ed_y" step="any" value="${joint.y || 0}"></div>
      <div class="form-group"><label>Off Z (mm)</label><input type="number" id="ed_z" step="any" value="${joint.z || 0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Rot R (deg)</label><input type="number" id="ed_r" step="any" value="${joint.r || 0}"></div>
      <div class="form-group"><label>Rot P (deg)</label><input type="number" id="ed_p" step="any" value="${joint.p || 0}"></div>
      <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="ed_yaw" step="any" value="${joint.yaw || 0}"></div>
    </div>
    <div class="form-row" id="ed_limit_row" style="${limitVisible ? '' : 'display:none'}">
      <div class="form-group"><label>Min (deg)</label><input type="number" id="ed_low" step="any" value="${joint.low !== undefined ? joint.low : -180}"></div>
      <div class="form-group"><label>Max (deg)</label><input type="number" id="ed_up" step="any" value="${joint.up !== undefined ? joint.up : 180}"></div>
    </div>
  </div>
</div>

<div class="accordion">
  <div class="accordion-header accordion-closed" onclick="toggleAccordion('visual_section')">
    <span>Visual</span><span class="accordion-arrow">&#9654;</span>
  </div>
  <div class="accordion-body" id="visual_section" style="display:none">
    <div class="form-group">
      <label>Shape</label>
      <div class="radio-group radio-group-wrap">${visTypeRadios}</div>
    </div>
    <div id="ed_vis_mesh_row" style="${visState.showMesh ? '' : 'display:none'}">
      <div class="form-group"><label>Mesh Path</label><input type="text" id="ed_vis_mesh" value="${escH(joint.vis_mesh || '')}"></div>
    </div>
    <div id="ed_vis_dims_row" style="${(visState.showDim1 || visState.showDim2 || visState.showDim3) ? '' : 'display:none'}">
      <div class="form-row">
        <div class="form-group" id="ed_vis_d1_group" style="${visState.showDim1 ? '' : 'display:none'}">
          <label>${visState.dim1Label}</label>
          <input type="number" id="ed_vd1" step="any" value="${joint.vis_dim1 || 0}">
        </div>
        <div class="form-group" id="ed_vis_d2_group" style="${visState.showDim2 ? '' : 'display:none'}">
          <label>${visState.dim2Label}</label>
          <input type="number" id="ed_vd2" step="any" value="${joint.vis_dim2 || 0}">
        </div>
        <div class="form-group" id="ed_vis_d3_group" style="${visState.showDim3 ? '' : 'display:none'}">
          <label>${visState.dim3Label}</label>
          <input type="number" id="ed_vd3" step="any" value="${joint.vis_dim3 || 0}">
        </div>
      </div>
    </div>
    <div id="ed_vis_offset_row" style="${visState.showOffset ? '' : 'display:none'}">
      <div class="form-row">
        <div class="form-group"><label>Off X (mm)</label><input type="number" id="ed_vx" step="any" value="${joint.vis_x || 0}"></div>
        <div class="form-group"><label>Off Y (mm)</label><input type="number" id="ed_vy" step="any" value="${joint.vis_y || 0}"></div>
        <div class="form-group"><label>Off Z (mm)</label><input type="number" id="ed_vz" step="any" value="${joint.vis_z || 0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Rot R (deg)</label><input type="number" id="ed_vr" step="any" value="${joint.vis_roll || 0}"></div>
        <div class="form-group"><label>Rot P (deg)</label><input type="number" id="ed_vp" step="any" value="${joint.vis_pitch || 0}"></div>
        <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="ed_vyaw" step="any" value="${joint.vis_yaw || 0}"></div>
      </div>
    </div>
  </div>
</div>

<div class="accordion">
  <div class="accordion-header accordion-closed" onclick="toggleAccordion('collision_section')">
    <span>Collision</span><span class="accordion-arrow">&#9654;</span>
  </div>
  <div class="accordion-body" id="collision_section" style="display:none">
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" id="ed_col_enabled" ${joint.col_enabled ? 'checked' : ''}> Enable Collision
      </label>
    </div>
    <div id="ed_col_inner" style="${colState.showInner ? '' : 'display:none'}">
      <div class="form-group">
        <label>Shape</label>
        <select id="ed_col_type">${colTypeSelect}</select>
      </div>
      <div id="ed_col_dims_row" style="${colState.showDim1 ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group" id="ed_col_d1_group" style="${colState.showDim1 ? '' : 'display:none'}">
            <label>${colState.dim1Label}</label>
            <input type="number" id="ed_cd1" step="any" value="${joint.col_dim1 || 0}">
          </div>
          <div class="form-group" id="ed_col_d2_group" style="${colState.showDim2 ? '' : 'display:none'}">
            <label>${colState.dim2Label}</label>
            <input type="number" id="ed_cd2" step="any" value="${joint.col_dim2 || 0}">
          </div>
          <div class="form-group" id="ed_col_d3_group" style="${colState.showDim3 ? '' : 'display:none'}">
            <label>${colState.dim3Label}</label>
            <input type="number" id="ed_cd3" step="any" value="${joint.col_dim3 || 0}">
          </div>
        </div>
      </div>
      <div id="ed_col_offset_row" style="${colState.showOffset ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group"><label>Off X (mm)</label><input type="number" id="ed_cx" step="any" value="${joint.col_x || 0}"></div>
          <div class="form-group"><label>Off Y (mm)</label><input type="number" id="ed_cy" step="any" value="${joint.col_y || 0}"></div>
          <div class="form-group"><label>Off Z (mm)</label><input type="number" id="ed_cz" step="any" value="${joint.col_z || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Rot R (deg)</label><input type="number" id="ed_cr" step="any" value="${joint.col_roll || 0}"></div>
          <div class="form-group"><label>Rot P (deg)</label><input type="number" id="ed_cp" step="any" value="${joint.col_pitch || 0}"></div>
          <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="ed_cyaw" step="any" value="${joint.col_yaw || 0}"></div>
        </div>
      </div>
    </div>
    <div style="border-top:1px solid #ddd;margin-top:8px;padding-top:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">Sphere Pack</span>
        <button class="btn btn-secondary btn-sm" onclick="addColSphere('ed')">+ Add Sphere</button>
      </div>
      <div style="font-size:10px;color:#888;margin-bottom:4px;">Sphere Collision Array — 위치/반지름 단위: mm</div>
      <div id="ed_sphere_list">${buildSphereListHtml('ed', joint.col_spheres || [])}</div>
    </div>
  </div>
</div>`;
}

// --- Render base editor ---

function renderBaseEditor(baseState) {
  if (!baseState) return '';

  const b = baseState;
  const visState = getVisUIState(b.vis_type || 'Auto (Cylinder)');
  const colState = getColUIState(b.col_enabled, b.col_type || 'Cylinder');

  const modeOptions = ['Fixed', 'Floating'];
  const modeRadios = modeOptions.map(m =>
    `<label class="radio-label"><input type="radio" name="base_mode" value="${m}" ${m === (b.mode || 'Fixed') ? 'checked' : ''}> ${m}</label>`
  ).join(' ');

  const visTypeOptions = ['Auto (Cylinder)', 'Auto (Box)', 'Manual (Cylinder)', 'Manual (Box)', 'Manual (Sphere)', 'Mesh', 'None'];
  const visTypeRadios = visTypeOptions.map(v =>
    `<label class="radio-label"><input type="radio" name="base_vis_type" value="${escH(v)}" ${v === (b.vis_type || 'Auto (Cylinder)') ? 'checked' : ''}> ${escH(v)}</label>`
  ).join(' ');

  const colTypeOptions = ['Cylinder', 'Box', 'Sphere'];
  const colTypeSelect = colTypeOptions.map(c =>
    `<option value="${c}" ${c === (b.col_type || 'Cylinder') ? 'selected' : ''}>${c}</option>`
  ).join('');

  return `
<div class="editor-header">
  <span class="editor-title">Base Joint Settings</span>
  <div class="editor-actions">
    <button class="btn btn-primary btn-sm" id="btn_base_apply">Apply</button>
    <button class="btn btn-secondary btn-sm" id="btn_base_close">Close</button>
  </div>
</div>

<div class="form-group">
  <label>Base Mode</label>
  <div class="radio-group">${modeRadios}</div>
  <div class="help-text">Fixed: world_to_base (fixed joint) | Floating: floating_base (floating joint)</div>
</div>

<div class="accordion">
  <div class="accordion-header" onclick="toggleAccordion('base_joint_section')">
    <span>Joint Origin (world to base_link)</span><span class="accordion-arrow">&#9660;</span>
  </div>
  <div class="accordion-body" id="base_joint_section">
    <div class="form-row">
      <div class="form-group"><label>Off X (mm)</label><input type="number" id="base_x" step="any" value="${b.x || 0}"></div>
      <div class="form-group"><label>Off Y (mm)</label><input type="number" id="base_y" step="any" value="${b.y || 0}"></div>
      <div class="form-group"><label>Off Z (mm)</label><input type="number" id="base_z" step="any" value="${b.z !== undefined ? b.z : 1000}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Rot R (deg)</label><input type="number" id="base_r" step="any" value="${b.r || 0}"></div>
      <div class="form-group"><label>Rot P (deg)</label><input type="number" id="base_p" step="any" value="${b.p || 0}"></div>
      <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="base_yaw" step="any" value="${b.yaw || 0}"></div>
    </div>
  </div>
</div>

<div class="accordion">
  <div class="accordion-header accordion-closed" onclick="toggleAccordion('base_visual_section')">
    <span>Visual (base_link)</span><span class="accordion-arrow">&#9654;</span>
  </div>
  <div class="accordion-body" id="base_visual_section" style="display:none">
    <div class="form-group">
      <label>Shape</label>
      <div class="radio-group radio-group-wrap">${visTypeRadios}</div>
    </div>
    <div id="base_vis_mesh_row" style="${visState.showMesh ? '' : 'display:none'}">
      <div class="form-group"><label>Mesh Path</label><input type="text" id="base_vis_mesh" value="${escH(b.vis_mesh || '')}"></div>
    </div>
    <div id="base_vis_dims_row" style="${(visState.showDim1 || visState.showDim2 || visState.showDim3) ? '' : 'display:none'}">
      <div class="form-row">
        <div class="form-group" id="base_vis_d1_group" style="${visState.showDim1 ? '' : 'display:none'}">
          <label>${visState.dim1Label}</label>
          <input type="number" id="base_vd1" step="any" value="${b.vis_dim1 || 50}">
        </div>
        <div class="form-group" id="base_vis_d2_group" style="${visState.showDim2 ? '' : 'display:none'}">
          <label>${visState.dim2Label}</label>
          <input type="number" id="base_vd2" step="any" value="${b.vis_dim2 || 100}">
        </div>
        <div class="form-group" id="base_vis_d3_group" style="${visState.showDim3 ? '' : 'display:none'}">
          <label>${visState.dim3Label}</label>
          <input type="number" id="base_vd3" step="any" value="${b.vis_dim3 || 50}">
        </div>
      </div>
    </div>
    <div id="base_vis_offset_row" style="${visState.showOffset ? '' : 'display:none'}">
      <div class="form-row">
        <div class="form-group"><label>Off X (mm)</label><input type="number" id="base_vx" step="any" value="${b.vis_x || 0}"></div>
        <div class="form-group"><label>Off Y (mm)</label><input type="number" id="base_vy" step="any" value="${b.vis_y || 0}"></div>
        <div class="form-group"><label>Off Z (mm)</label><input type="number" id="base_vz" step="any" value="${b.vis_z || 0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Rot R (deg)</label><input type="number" id="base_vr" step="any" value="${b.vis_roll || 0}"></div>
        <div class="form-group"><label>Rot P (deg)</label><input type="number" id="base_vp" step="any" value="${b.vis_pitch || 0}"></div>
        <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="base_vyaw" step="any" value="${b.vis_yaw || 0}"></div>
      </div>
    </div>
  </div>
</div>

<div class="accordion">
  <div class="accordion-header accordion-closed" onclick="toggleAccordion('base_collision_section')">
    <span>Collision (base_link)</span><span class="accordion-arrow">&#9654;</span>
  </div>
  <div class="accordion-body" id="base_collision_section" style="display:none">
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" id="base_col_enabled" ${b.col_enabled ? 'checked' : ''}> Enable Collision
      </label>
    </div>
    <div id="base_col_inner" style="${colState.showInner ? '' : 'display:none'}">
      <div class="form-group">
        <label>Shape</label>
        <select id="base_col_type">${colTypeSelect}</select>
      </div>
      <div id="base_col_dims_row" style="${colState.showDim1 ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group" id="base_col_d1_group" style="${colState.showDim1 ? '' : 'display:none'}">
            <label>${colState.dim1Label}</label>
            <input type="number" id="base_cd1" step="any" value="${b.col_dim1 || 50}">
          </div>
          <div class="form-group" id="base_col_d2_group" style="${colState.showDim2 ? '' : 'display:none'}">
            <label>${colState.dim2Label}</label>
            <input type="number" id="base_cd2" step="any" value="${b.col_dim2 || 100}">
          </div>
          <div class="form-group" id="base_col_d3_group" style="${colState.showDim3 ? '' : 'display:none'}">
            <label>${colState.dim3Label}</label>
            <input type="number" id="base_cd3" step="any" value="${b.col_dim3 || 50}">
          </div>
        </div>
      </div>
      <div id="base_col_offset_row" style="${colState.showOffset ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group"><label>Off X (mm)</label><input type="number" id="base_cx" step="any" value="${b.col_x || 0}"></div>
          <div class="form-group"><label>Off Y (mm)</label><input type="number" id="base_cy" step="any" value="${b.col_y || 0}"></div>
          <div class="form-group"><label>Off Z (mm)</label><input type="number" id="base_cz" step="any" value="${b.col_z || 0}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Rot R (deg)</label><input type="number" id="base_cr" step="any" value="${b.col_roll || 0}"></div>
          <div class="form-group"><label>Rot P (deg)</label><input type="number" id="base_cp" step="any" value="${b.col_pitch || 0}"></div>
          <div class="form-group"><label>Rot Y (deg)</label><input type="number" id="base_cyaw" step="any" value="${b.col_yaw || 0}"></div>
        </div>
      </div>
    </div>
    <div style="border-top:1px solid #ddd;margin-top:8px;padding-top:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">Sphere Pack</span>
        <button class="btn btn-secondary btn-sm" onclick="addColSphere('base')">+ Add Sphere</button>
      </div>
      <div style="font-size:10px;color:#888;margin-bottom:4px;">구형 충돌체 배치 — 위치/반지름 단위: mm</div>
      <div id="base_sphere_list">${buildSphereListHtml('base', b.col_spheres || [])}</div>
    </div>
  </div>
</div>`;
}

// --- Read form values ---

function getJointFromForm() {
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const getNum = (id) => { const v = parseFloat(getVal(id)); return isNaN(v) ? 0 : v; };
  const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const getRadio = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  };

  return {
    name: getVal('ed_name'),
    parent: getVal('ed_parent'),
    child: getVal('ed_child'),
    axis: getRadio('ed_axis'),
    x: getNum('ed_x'), y: getNum('ed_y'), z: getNum('ed_z'),
    r: getNum('ed_r'), p: getNum('ed_p'), yaw: getNum('ed_yaw'),
    low: getNum('ed_low'), up: getNum('ed_up'),
    vis_type: getRadio('ed_vis_type'),
    vis_mesh: getVal('ed_vis_mesh'),
    vis_dim1: getNum('ed_vd1'), vis_dim2: getNum('ed_vd2'), vis_dim3: getNum('ed_vd3'),
    vis_x: getNum('ed_vx'), vis_y: getNum('ed_vy'), vis_z: getNum('ed_vz'),
    vis_roll: getNum('ed_vr'), vis_pitch: getNum('ed_vp'), vis_yaw: getNum('ed_vyaw'),
    col_enabled: getChk('ed_col_enabled'),
    col_type: getVal('ed_col_type'),
    col_dim1: getNum('ed_cd1'), col_dim2: getNum('ed_cd2'), col_dim3: getNum('ed_cd3'),
    col_x: getNum('ed_cx'), col_y: getNum('ed_cy'), col_z: getNum('ed_cz'),
    col_roll: getNum('ed_cr'), col_pitch: getNum('ed_cp'), col_yaw: getNum('ed_cyaw'),
    col_spheres: readColSpheres('ed')
  };
}

function getBaseFromForm() {
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const getNum = (id) => { const v = parseFloat(getVal(id)); return isNaN(v) ? 0 : v; };
  const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
  const getRadio = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  };

  return {
    mode: getRadio('base_mode') || 'Fixed',
    x: getNum('base_x'), y: getNum('base_y'), z: getNum('base_z'),
    r: getNum('base_r'), p: getNum('base_p'), yaw: getNum('base_yaw'),
    vis_type: getRadio('base_vis_type') || 'Auto (Cylinder)',
    vis_mesh: getVal('base_vis_mesh'),
    vis_dim1: getNum('base_vd1'), vis_dim2: getNum('base_vd2'), vis_dim3: getNum('base_vd3'),
    vis_x: getNum('base_vx'), vis_y: getNum('base_vy'), vis_z: getNum('base_vz'),
    vis_roll: getNum('base_vr'), vis_pitch: getNum('base_vp'), vis_yaw: getNum('base_vyaw'),
    col_enabled: getChk('base_col_enabled'),
    col_type: getVal('base_col_type') || 'Cylinder',
    col_dim1: getNum('base_cd1'), col_dim2: getNum('base_cd2'), col_dim3: getNum('base_cd3'),
    col_x: getNum('base_cx'), col_y: getNum('base_cy'), col_z: getNum('base_cz'),
    col_roll: getNum('base_cr'), col_pitch: getNum('base_cp'), col_yaw: getNum('base_cyaw'),
    col_spheres: readColSpheres('base')
  };
}

// --- Accordion toggle ---
function toggleAccordion(id) {
  const body = document.getElementById(id);
  if (!body) return;
  const header = body.previousElementSibling;
  const arrow = header ? header.querySelector('.accordion-arrow') : null;
  if (body.style.display === 'none') {
    body.style.display = '';
    if (header) header.classList.remove('accordion-closed');
    if (arrow) arrow.innerHTML = '&#9660;';
  } else {
    body.style.display = 'none';
    if (header) header.classList.add('accordion-closed');
    if (arrow) arrow.innerHTML = '&#9654;';
  }
}

// --- Attach live event listeners to editor ---
function attachJointEditorListeners() {
  // Axis radio change -> show/hide limits
  document.querySelectorAll('input[name="ed_axis"]').forEach(el => {
    el.addEventListener('change', () => {
      const val = el.value;
      const limitRow = document.getElementById('ed_limit_row');
      if (limitRow) limitRow.style.display = (val === 'Fixed') ? 'none' : '';
    });
  });

  // Visual type radio change
  document.querySelectorAll('input[name="ed_vis_type"]').forEach(el => {
    el.addEventListener('change', () => {
      const state = getVisUIState(el.value);
      applyVisState('ed', state);
      // Also update dims visibility container
      const dimsRow = document.getElementById('ed_vis_dims_row');
      if (dimsRow) dimsRow.style.display = (state.showDim1 || state.showDim2 || state.showDim3) ? '' : 'none';
    });
  });

  // Collision enabled checkbox
  const colEn = document.getElementById('ed_col_enabled');
  if (colEn) {
    colEn.addEventListener('change', () => {
      const cType = document.getElementById('ed_col_type');
      const state = getColUIState(colEn.checked, cType ? cType.value : 'Cylinder');
      applyColState('ed', state);
    });
  }

  // Collision type dropdown
  const colType = document.getElementById('ed_col_type');
  if (colType) {
    colType.addEventListener('change', () => {
      const enabled = document.getElementById('ed_col_enabled');
      const state = getColUIState(enabled ? enabled.checked : false, colType.value);
      applyColState('ed', state);
    });
  }
}

function attachBaseEditorListeners() {
  // Visual type radio change
  document.querySelectorAll('input[name="base_vis_type"]').forEach(el => {
    el.addEventListener('change', () => {
      const state = getVisUIState(el.value);
      applyVisState('base', state);
      const dimsRow = document.getElementById('base_vis_dims_row');
      if (dimsRow) dimsRow.style.display = (state.showDim1 || state.showDim2 || state.showDim3) ? '' : 'none';
    });
  });

  // Collision enabled checkbox
  const colEn = document.getElementById('base_col_enabled');
  if (colEn) {
    colEn.addEventListener('change', () => {
      const cType = document.getElementById('base_col_type');
      const state = getColUIState(colEn.checked, cType ? cType.value : 'Cylinder');
      applyColState('base', state);
    });
  }

  // Collision type dropdown
  const colType = document.getElementById('base_col_type');
  if (colType) {
    colType.addEventListener('change', () => {
      const enabled = document.getElementById('base_col_enabled');
      const state = getColUIState(enabled ? enabled.checked : false, colType.value);
      applyColState('base', state);
    });
  }
}

// HTML escape helper
function escH(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Sphere Pack helpers ---

function buildSphereListHtml(prefix, spheres) {
  if (!spheres || spheres.length === 0) return '';
  return spheres.map(sp => `
    <div class="sphere-row" style="display:flex;gap:4px;margin-bottom:4px;align-items:flex-end;flex-wrap:wrap;">
      <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">X(mm)</label><input type="number" class="sp-x" step="any" value="${sp.x || 0}" style="width:55px;"></div>
      <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">Y(mm)</label><input type="number" class="sp-y" step="any" value="${sp.y || 0}" style="width:55px;"></div>
      <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">Z(mm)</label><input type="number" class="sp-z" step="any" value="${sp.z || 0}" style="width:55px;"></div>
      <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">R(mm)</label><input type="number" class="sp-r" step="any" value="${sp.radius || 20}" style="width:55px;"></div>
      <button class="btn btn-danger btn-sm" style="height:28px;" onclick="removeColSphere(this)">×</button>
    </div>
  `).join('');
}

function renderColSpheres(prefix, spheres) {
  const container = document.getElementById(`${prefix}_sphere_list`);
  if (!container) return;
  container.innerHTML = buildSphereListHtml(prefix, spheres);
}

function addColSphere(prefix) {
  const container = document.getElementById(`${prefix}_sphere_list`);
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'sphere-row';
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;align-items:flex-end;flex-wrap:wrap;';
  row.innerHTML = `
    <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">X(mm)</label><input type="number" class="sp-x" step="any" value="0" style="width:55px;"></div>
    <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">Y(mm)</label><input type="number" class="sp-y" step="any" value="0" style="width:55px;"></div>
    <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">Z(mm)</label><input type="number" class="sp-z" step="any" value="0" style="width:55px;"></div>
    <div style="display:flex;flex-direction:column;"><label style="font-size:10px;">R(mm)</label><input type="number" class="sp-r" step="any" value="20" style="width:55px;"></div>
    <button class="btn btn-danger btn-sm" style="height:28px;" onclick="removeColSphere(this)">×</button>
  `;
  container.appendChild(row);
}

function removeColSphere(btn) {
  btn.closest('.sphere-row').remove();
}

function readColSpheres(prefix) {
  const container = document.getElementById(`${prefix}_sphere_list`);
  if (!container) return [];
  const spheres = [];
  container.querySelectorAll('.sphere-row').forEach(row => {
    spheres.push({
      x: parseFloat(row.querySelector('.sp-x').value) || 0,
      y: parseFloat(row.querySelector('.sp-y').value) || 0,
      z: parseFloat(row.querySelector('.sp-z').value) || 0,
      radius: parseFloat(row.querySelector('.sp-r').value) || 20
    });
  });
  return spheres;
}
