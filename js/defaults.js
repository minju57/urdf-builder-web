// defaults.js - Port of joint_logic.py default getters

function getDefaultBaseJoint() {
  return {
    mode: 'Fixed',
    name: 'world_to_base',
    child: 'base_link',
    x: 0, y: 0, z: 1000,
    r: 0, p: 0, yaw: 0,
    vis_type: 'Auto (Cylinder)',
    vis_mesh: 'meshes/body.STL',
    vis_dim1: 50, vis_dim2: 100, vis_dim3: 50,
    vis_x: 0, vis_y: 0, vis_z: 0,
    vis_roll: 0, vis_pitch: 0, vis_yaw: 0,
    col_enabled: false,
    col_type: 'Cylinder',
    col_dim1: 50, col_dim2: 100, col_dim3: 50,
    col_x: 0, col_y: 0, col_z: 0,
    col_roll: 0, col_pitch: 0, col_yaw: 0
  };
}

function getDefaultJoint(index, parentName = 'base_link') {
  return {
    name: `joint_${index}`,
    parent: parentName,
    child: `link_${index}`,
    type: 'revolute',
    axis: 'Roll',
    x: 0, y: 0, z: 0,
    r: 0, p: 0, yaw: 0,
    low: -180, up: 180,
    vis_type: 'Auto (Cylinder)',
    vis_mesh: 'meshes/link.STL',
    vis_dim1: 40, vis_dim2: 100, vis_dim3: 40,
    vis_x: 0, vis_y: 0, vis_z: 0,
    vis_roll: 0, vis_pitch: 0, vis_yaw: 0,
    col_enabled: false,
    col_type: 'Cylinder',
    col_dim1: 40, col_dim2: 100, col_dim3: 40,
    col_x: 0, col_y: 0, col_z: 0,
    col_roll: 0, col_pitch: 0, col_yaw: 0
  };
}
