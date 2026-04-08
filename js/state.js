// state.js - Application state management

const AppState = {
  joints: [],
  selectedIndex: -1,
  baseState: null,
  isImported: false,
  inertiaData: null,
  _listeners: [],

  subscribe(fn) {
    this._listeners.push(fn);
  },

  emit(event) {
    this._listeners.forEach(fn => fn(event));
  },

  setJoints(joints) {
    this.joints = joints.map(j => Object.assign({}, j));
    this.emit('joints');
  },

  setSelected(idx) {
    this.selectedIndex = idx;
    this.emit('selected');
  },

  setBase(base) {
    this.baseState = Object.assign({}, base);
    this.emit('base');
  },

  addJoint() {
    const data = this.joints;
    const selectedIdx = this.selectedIndex;
    let parentLink = 'base_link';

    if (selectedIdx === -3 || selectedIdx === -2) {
      // base joint or base_link node selected -> add child of base_link
      parentLink = (this.baseState && this.baseState.child) ? this.baseState.child : 'base_link';
    } else if (selectedIdx <= -10) {
      // link node selected: -(i+10) encoding -> that joint's child link is parent
      const jointIdx = -(selectedIdx + 10);
      if (jointIdx >= 0 && jointIdx < data.length) {
        parentLink = data[jointIdx].child;
      }
    } else if (selectedIdx >= 0 && selectedIdx < data.length) {
      parentLink = data[selectedIdx].child;
    } else if (data.length > 0) {
      parentLink = data[data.length - 1].child;
    }

    const existingNames = new Set(data.map(j => j.name));
    const existingLinks = new Set(data.map(j => j.child));
    let idx = data.length;
    while (existingNames.has(`joint_${idx}`) || existingLinks.has(`link_${idx}`)) idx++;
    const newJoint = getDefaultJoint(idx, parentLink);
    const newJoints = data.concat([newJoint]);
    this.joints = newJoints;
    this.selectedIndex = newJoints.length - 1;
    this.emit('joints');
    this.emit('selected');
  },

  deleteJoint(index) {
    if (index >= 0 && index < this.joints.length) {
      this.joints = this.joints.slice(0, index).concat(this.joints.slice(index + 1));
      this.selectedIndex = -1;
      this.emit('joints');
      this.emit('selected');
    }
  },

  moveUp(idx) {
    if (idx === null || idx === undefined || idx <= 0 || idx >= this.joints.length) return;
    const data = this.joints.slice();
    const tmp = data[idx];
    data[idx] = data[idx - 1];
    data[idx - 1] = tmp;
    this.joints = data;
    this.selectedIndex = idx - 1;
    this.emit('joints');
    this.emit('selected');
  },

  moveDown(idx) {
    if (idx === null || idx === undefined || idx < 0 || idx >= this.joints.length - 1) return;
    const data = this.joints.slice();
    const tmp = data[idx];
    data[idx] = data[idx + 1];
    data[idx + 1] = tmp;
    this.joints = data;
    this.selectedIndex = idx + 1;
    this.emit('joints');
    this.emit('selected');
  },

  applyJointChanges(idx, newValues) {
    // newValues: object with all joint fields
    if (idx < 0 || idx >= this.joints.length) return;

    const data = this.joints.slice();
    const oldChildName = data[idx].child;

    // Merge new values
    const j = Object.assign({}, data[idx]);

    // col_spheres는 배열이므로 keys 루프 밖에서 직접 복사
    if ('col_spheres' in newValues) {
      j.col_spheres = Array.isArray(newValues.col_spheres) ? newValues.col_spheres : [];
    }

    const keys = [
      'name', 'parent', 'child', 'axis',
      'x', 'y', 'z', 'r', 'p', 'yaw', 'low', 'up',
      'vis_type', 'vis_mesh', 'vis_dim1', 'vis_dim2', 'vis_dim3',
      'vis_x', 'vis_y', 'vis_z', 'vis_roll', 'vis_pitch', 'vis_yaw',
      'col_enabled', 'col_type', 'col_dim1', 'col_dim2', 'col_dim3',
      'col_x', 'col_y', 'col_z', 'col_roll', 'col_pitch', 'col_yaw'
    ];

    const strKeys = new Set(['name', 'parent', 'child', 'axis', 'vis_type', 'vis_mesh', 'col_type', 'col_enabled']);
    const angleKeys = new Set(['r', 'p', 'yaw', 'low', 'up', 'col_roll', 'col_pitch', 'col_yaw', 'vis_roll', 'vis_pitch', 'vis_yaw']);

    for (const key of keys) {
      if (!(key in newValues)) continue;
      let val = newValues[key];

      if (key === 'axis' && val === 'Fixed') {
        j.type = 'fixed';
      } else if (key === 'axis' && ['Roll', 'Pitch', 'Yaw'].includes(val)) {
        j.type = 'revolute';
      }

      if (!strKeys.has(key)) {
        const n = parseFloat(val);
        val = isNaN(n) ? 0.0 : n;
        if (angleKeys.has(key)) {
          val = Math.max(-180.0, Math.min(180.0, val));
        }
      }

      j[key] = val;

      if (key === 'low' && j.up < val) j.up = val;
      else if (key === 'up' && j.low > val) j.low = val;
    }

    data[idx] = j;
    const newChildName = j.child;

    // Update children whose parent was oldChildName
    if (oldChildName !== newChildName) {
      let count = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i].parent === oldChildName) {
          data[i] = Object.assign({}, data[i], { parent: newChildName });
          count++;
        }
      }
    }

    this.joints = data;
    this.emit('joints');
  },

  applyBaseChanges(newValues) {
    const keys = [
      'mode', 'x', 'y', 'z', 'r', 'p', 'yaw',
      'vis_type', 'vis_mesh', 'vis_dim1', 'vis_dim2', 'vis_dim3',
      'vis_x', 'vis_y', 'vis_z', 'vis_roll', 'vis_pitch', 'vis_yaw',
      'col_enabled', 'col_type', 'col_dim1', 'col_dim2', 'col_dim3',
      'col_x', 'col_y', 'col_z', 'col_roll', 'col_pitch', 'col_yaw'
    ];
    const strKeys = new Set(['mode', 'vis_type', 'vis_mesh', 'col_type', 'col_enabled']);

    const b = Object.assign({}, this.baseState);
    if ('col_spheres' in newValues) {
      b.col_spheres = Array.isArray(newValues.col_spheres) ? newValues.col_spheres : [];
    }
    for (const key of keys) {
      if (!(key in newValues)) continue;
      let val = newValues[key];
      if (!strKeys.has(key)) {
        const n = parseFloat(val);
        val = isNaN(n) ? 0.0 : n;
      }
      b[key] = val;
    }
    b.name = (b.mode === 'Fixed') ? 'world_to_base' : 'floating_base';
    b.child = 'base_link';
    this.baseState = b;
    this.emit('base');
  }
};
