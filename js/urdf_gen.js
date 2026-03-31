// urdf_gen.js - Port of urdf_generator.py URDFManager

function degToRad(deg) {
  try { return parseFloat(deg) * (Math.PI / 180.0); }
  catch (e) { return 0.0; }
}

function getAxisVector(axisName) {
  const map = { 'Roll': '1 0 0', 'Pitch': '0 1 0', 'Yaw': '0 0 1' };
  return map[axisName] || '1 0 0';
}

// Port of _calc_cylinder_geometry from Python
function calcCylinderGeometry(dx, dy, dz) {
  const cx = dx * 0.5, cy = dy * 0.5, cz = dz * 0.5;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  let roll = 0.0, pitch = 0.0, yaw = 0.0;
  let length = 0.0, radius = 0.0;

  if (ax >= ay && ax >= az) {
    // X axis dominant: rotate around Y -> align to X
    pitch = 1.5708;
    length = ax;
    radius = 0.5 * Math.sqrt(dy * dy + dz * dz);
  } else if (ay >= ax && ay >= az) {
    // Y axis dominant: rotate around X -> align to Y
    roll = 1.5708;
    length = ay;
    radius = 0.5 * Math.sqrt(dx * dx + dz * dz);
  } else {
    // Z axis dominant: default
    length = az;
    radius = 0.5 * Math.sqrt(dx * dx + dy * dy);
  }

  if (length < 1e-6) length = 0.05;
  if (radius < 0.02) radius = 0.03;

  return {
    center: [cx, cy, cz],
    rotation: [roll, pitch, yaw],
    dims: [length, radius]
  };
}

// Port of _calc_box_geometry from Python
function calcBoxGeometry(dx, dy, dz) {
  const cx = dx * 0.5, cy = dy * 0.5, cz = dz * 0.5;
  const lx = Math.abs(dx) > 1e-3 ? Math.abs(dx) : 0.05;
  const ly = Math.abs(dy) > 1e-3 ? Math.abs(dy) : 0.05;
  const lz = Math.abs(dz) > 1e-3 ? Math.abs(dz) : 0.05;
  return {
    center: [cx, cy, cz],
    dims: [lx, ly, lz]
  };
}

function fmt4(v) {
  return parseFloat(v).toFixed(4);
}

function xmlAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Indent helpers
const L0 = '';
const L1 = '  ';
const L2 = '    ';
const L3 = '      ';
const L4 = '        ';

function xmlHeader() { return '<?xml version="1.0"?>'; }
function tag(indent, name, attrs) { return `${indent}<${name} ${attrs}/>`; }
function startTag(indent, name, attrs) { return attrs ? `${indent}<${name} ${attrs}>` : `${indent}<${name}>`; }
function endTag(indent, name) { return `${indent}</${name}>`; }

function materialTag(indent, name, r, g, b, a = 1.0) {
  return [
    startTag(indent, 'material', `name="${name}"`),
    tag(indent + '  ', 'color', `rgba="${r} ${g} ${b} ${a}"`),
    endTag(indent, 'material')
  ].join('\n');
}

function inertialTag(indent, mass = 1.0, xyz = [0, 0, 0], ixx = 0.01, ixy = 0, ixz = 0, iyy = 0.01, iyz = 0, izz = 0.01) {
  return [
    startTag(indent, 'inertial'),
    tag(indent + '  ', 'origin', `xyz="${xyz[0]} ${xyz[1]} ${xyz[2]}" rpy="0 0 0"`),
    tag(indent + '  ', 'mass', `value="${mass}"`),
    tag(indent + '  ', 'inertia', `ixx="${ixx}" ixy="${ixy}" ixz="${ixz}" iyy="${iyy}" iyz="${iyz}" izz="${izz}"`),
    endTag(indent, 'inertial')
  ].join('\n');
}

function mujocoSetting(indent) {
  return [
    startTag(indent, 'mujoco'),
    tag(indent + '  ', 'compiler', 'discardvisual="false"'),
    endTag(indent, 'mujoco')
  ].join('\n');
}

// Main URDF generation function
// joints: array of joint objects (x/y/z in mm, angles in degrees)
// baseJoint: base joint object
// inertiaData: array of inertia row objects or null
// robotName: string
// isImported: boolean
function generateURDF(joints, robotName, baseJoint, inertiaData, isImported) {
  if (!robotName) robotName = 'generated_robot';
  const lines = [];

  lines.push(xmlHeader());
  lines.push(startTag(L0, 'robot', `name="${xmlAttr(robotName)}"`));
  lines.push(mujocoSetting(L1));

  // Build child map for auto geometry
  const childMap = {};
  for (const j of joints) {
    const p = j.parent;
    if (!childMap[p]) childMap[p] = [];
    childMap[p].push(j);
  }

  const hasBase = baseJoint != null && !baseJoint.no_base;

  // Build link_name → inertia row map for name-based matching
  const inertiaMap = {};
  if (inertiaData) {
    for (const row of inertiaData) {
      const key = (row.link_name || '').toString().trim();
      if (key) inertiaMap[key] = row;
    }
  }
  function getInertia(linkName) {
    return inertiaMap[linkName] || null;
  }

  let baseLinkName = 'base_link';

  if (hasBase) {
    baseLinkName = baseJoint.child || 'base_link';
    const mode = baseJoint.mode || 'Fixed';

    const bx = (baseJoint.x || 0) / 1000.0;
    const by = (baseJoint.y || 0) / 1000.0;
    const bz = (baseJoint.z || 1000) / 1000.0;
    const br = degToRad(baseJoint.r || 0);
    const bp = degToRad(baseJoint.p || 0);
    const byaw = degToRad(baseJoint.yaw || 0);

    if (mode === 'Fixed') {
      lines.push(tag(L1, 'link', 'name="world"'));
      lines.push(startTag(L1, 'joint', 'name="world_to_base" type="fixed"'));
      lines.push(tag(L2, 'parent', 'link="world"'));
      lines.push(tag(L2, 'child', `link="${xmlAttr(baseLinkName)}"`));
      lines.push(tag(L2, 'origin', `xyz="${bx} ${by} ${bz}" rpy="${fmt4(br)} ${fmt4(bp)} ${fmt4(byaw)}"`));
      lines.push(endTag(L1, 'joint'));
    } else {
      lines.push(startTag(L1, 'link', 'name="base"'));
      lines.push(startTag(L2, 'visual'));
      lines.push(tag(L3, 'origin', 'rpy="0 0 0" xyz="0 0 0"'));
      lines.push(startTag(L3, 'geometry'));
      lines.push(tag(L4, 'box', 'size="0.001 0.001 0.001"'));
      lines.push(endTag(L3, 'geometry'));
      lines.push(endTag(L2, 'visual'));
      lines.push(endTag(L1, 'link'));
      lines.push(startTag(L1, 'joint', 'name="floating_base" type="floating"'));
      lines.push(tag(L2, 'origin', `xyz="${bx} ${by} ${bz}" rpy="${fmt4(br)} ${fmt4(bp)} ${fmt4(byaw)}"`));
      lines.push(tag(L2, 'parent', 'link="base"'));
      lines.push(tag(L2, 'child', `link="${xmlAttr(baseLinkName)}"`));
      lines.push(endTag(L1, 'joint'));
    }

    // Base link
    lines.push(startTag(L1, 'link', `name="${xmlAttr(baseLinkName)}"`));

    const baseVisType = baseJoint.vis_type || 'Auto (Cylinder)';

    if (baseVisType !== 'None') {
      lines.push(startTag(L2, 'visual'));

      if (baseVisType === 'Auto (Cylinder)') {
        let bodyRadius = 0.08;
        const connected = childMap[baseLinkName] || [];
        if (connected.length > 0) {
          const j0 = connected[0];
          const dist = Math.sqrt((j0.x / 1000) ** 2 + (j0.y / 1000) ** 2);
          if (dist > 0.05) bodyRadius = dist * 1.1;
        }
        lines.push(tag(L3, 'origin', 'xyz="0 0 -0.5" rpy="0 0 0"'));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'cylinder', `radius="${fmt4(bodyRadius)}" length="1.0"`));
        lines.push(endTag(L3, 'geometry'));

      } else if (baseVisType === 'Auto (Box)') {
        const bodySize = 0.16;
        lines.push(tag(L3, 'origin', 'xyz="0 0 -0.5" rpy="0 0 0"'));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'box', `size="${bodySize} ${bodySize} 1.0"`));
        lines.push(endTag(L3, 'geometry'));

      } else if (baseVisType === 'Mesh') {
        const vx = (baseJoint.vis_x || 0) / 1000.0;
        const vy = (baseJoint.vis_y || 0) / 1000.0;
        const vz = (baseJoint.vis_z || 0) / 1000.0;
        const vr = degToRad(baseJoint.vis_roll || 0);
        const vp = degToRad(baseJoint.vis_pitch || 0);
        const vyaw = degToRad(baseJoint.vis_yaw || 0);
        lines.push(tag(L3, 'origin', `xyz="${vx} ${vy} ${vz}" rpy="${fmt4(vr)} ${fmt4(vp)} ${fmt4(vyaw)}"`));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'mesh', `filename="${baseJoint.vis_mesh || ''}" scale="0.001 0.001 0.001"`));
        lines.push(endTag(L3, 'geometry'));

      } else if (baseVisType.startsWith('Manual')) {
        const shape = baseVisType.split('(')[1].replace(')', '').trim();
        const d1 = (baseJoint.vis_dim1 || 50) / 1000.0;
        const d2 = (baseJoint.vis_dim2 || 100) / 1000.0;
        const d3 = (baseJoint.vis_dim3 || 50) / 1000.0;
        const vx = (baseJoint.vis_x || 0) / 1000.0;
        const vy = (baseJoint.vis_y || 0) / 1000.0;
        const vz = (baseJoint.vis_z || 0) / 1000.0;
        const vr = degToRad(baseJoint.vis_roll || 0);
        const vp = degToRad(baseJoint.vis_pitch || 0);
        const vyaw = degToRad(baseJoint.vis_yaw || 0);
        lines.push(tag(L3, 'origin', `xyz="${vx} ${vy} ${vz}" rpy="${fmt4(vr)} ${fmt4(vp)} ${fmt4(vyaw)}"`));
        lines.push(startTag(L3, 'geometry'));
        if (shape === 'Box') lines.push(tag(L4, 'box', `size="${d1} ${d2} ${d3}"`));
        else if (shape === 'Sphere') lines.push(tag(L4, 'sphere', `radius="${d1}"`));
        else lines.push(tag(L4, 'cylinder', `radius="${d1}" length="${d2}"`));
        lines.push(endTag(L3, 'geometry'));
      }

      lines.push(materialTag(L3, 'base_grey', 0.2, 0.2, 0.2));
      lines.push(endTag(L2, 'visual'));
    }

    // Base collision
    if (baseJoint.col_enabled) {
      lines.push(startTag(L2, 'collision'));
      const cx = (baseJoint.col_x || 0) / 1000.0;
      const cy = (baseJoint.col_y || 0) / 1000.0;
      const cz = (baseJoint.col_z || 0) / 1000.0;
      const cr = degToRad(baseJoint.col_roll || 0);
      const cp = degToRad(baseJoint.col_pitch || 0);
      const cyaw = degToRad(baseJoint.col_yaw || 0);
      lines.push(tag(L3, 'origin', `xyz="${cx} ${cy} ${cz}" rpy="${fmt4(cr)} ${fmt4(cp)} ${fmt4(cyaw)}"`));
      lines.push(startTag(L3, 'geometry'));
      const cType = baseJoint.col_type || 'Cylinder';
      const cd1 = (baseJoint.col_dim1 || 50) / 1000.0;
      const cd2 = (baseJoint.col_dim2 || 100) / 1000.0;
      const cd3 = (baseJoint.col_dim3 || 50) / 1000.0;
      if (cType === 'Box') lines.push(tag(L4, 'box', `size="${cd1} ${cd2} ${cd3}"`));
      else if (cType === 'Sphere') lines.push(tag(L4, 'sphere', `radius="${cd1}"`));
      else lines.push(tag(L4, 'cylinder', `radius="${cd1}" length="${cd2}"`));
      lines.push(endTag(L3, 'geometry'));
      lines.push(endTag(L2, 'collision'));
    }

    // Base sphere pack collisions
    if (baseJoint.col_spheres && baseJoint.col_spheres.length > 0) {
      baseJoint.col_spheres.forEach((sp, si) => {
        const sx = (sp.x || 0) / 1000.0;
        const sy = (sp.y || 0) / 1000.0;
        const sz = (sp.z || 0) / 1000.0;
        const sr = (sp.radius || 0.02) / 1000.0;
        lines.push(startTag(L2, 'collision', `name="sphere_col_${si}"`));
        lines.push(tag(L3, 'origin', `xyz="${fmt4(sx)} ${fmt4(sy)} ${fmt4(sz)}" rpy="0 0 0"`));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'sphere', `radius="${fmt4(sr)}"`));
        lines.push(endTag(L3, 'geometry'));
        lines.push(endTag(L2, 'collision'));
      });
    }

    // Base inertia
    const bd = getInertia(baseLinkName);
    if (bd) {
      lines.push(inertialTag(L2,
        bd.mass ?? bd.m ?? 1.0,
        [bd.com_x ?? bd.x ?? 0, bd.com_y ?? bd.y ?? 0, bd.com_z ?? bd.z ?? 0],
        bd.ixx ?? 0.01, bd.ixy ?? 0, bd.ixz ?? 0,
        bd.iyy ?? 0.01, bd.iyz ?? 0, bd.izz ?? 0.01
      ));
    } else {
      lines.push(inertialTag(L2, 10.0));
    }

    lines.push(endTag(L1, 'link'));
  }

  // Joints loop
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    const jName = j.name || `joint_${i}`;
    const pLink = j.parent || (hasBase ? baseLinkName : 'base_link');
    const cLink = j.child || `link_${i}`;

    // x/y/z are in mm, convert to meters
    const jx = (j.x || 0) / 1000.0;
    const jy = (j.y || 0) / 1000.0;
    const jz = (j.z || 0) / 1000.0;
    const jr = degToRad(j.r || 0);
    const jp = degToRad(j.p || 0);
    const jyaw = degToRad(j.yaw || 0);
    const axis = getAxisVector(j.axis);
    const low = degToRad(j.low !== undefined ? j.low : -180);
    const up = degToRad(j.up !== undefined ? j.up : 180);
    const jType = j.type || 'revolute';

    // Write joint
    lines.push(startTag(L1, 'joint', `name="${xmlAttr(jName)}" type="${jType}"`));
    lines.push(tag(L2, 'parent', `link="${xmlAttr(pLink)}"`));
    lines.push(tag(L2, 'child', `link="${xmlAttr(cLink)}"`));
    lines.push(tag(L2, 'origin', `xyz="${jx} ${jy} ${jz}" rpy="${fmt4(jr)} ${fmt4(jp)} ${fmt4(jyaw)}"`));
    if (jType !== 'fixed') {
      lines.push(tag(L2, 'axis', `xyz="${axis}"`));
      lines.push(tag(L2, 'limit', `lower="${fmt4(low)}" upper="${fmt4(up)}" effort="10" velocity="1"`));
    }
    lines.push(endTag(L1, 'joint'));

    // Write child link
    lines.push(startTag(L1, 'link', `name="${xmlAttr(cLink)}"`));

    const visMode = j.vis_type || 'Auto (Cylinder)';

    // Case A: Mesh
    if (visMode === 'Mesh') {
      lines.push(startTag(L2, 'visual'));
      const vx = (j.vis_x || 0) / 1000.0;
      const vy = (j.vis_y || 0) / 1000.0;
      const vz = (j.vis_z || 0) / 1000.0;
      const vr = degToRad(j.vis_roll || 0);
      const vp = degToRad(j.vis_pitch || 0);
      const vyaw = degToRad(j.vis_yaw || 0);
      lines.push(tag(L3, 'origin', `xyz="${vx} ${vy} ${vz}" rpy="${fmt4(vr)} ${fmt4(vp)} ${fmt4(vyaw)}"`));
      lines.push(startTag(L3, 'geometry'));
      lines.push(tag(L4, 'mesh', `filename="${j.vis_mesh || ''}" scale="0.001 0.001 0.001"`));
      lines.push(endTag(L3, 'geometry'));
      lines.push(materialTag(L3, `mat_${i}`, 0.6, 0.6, 0.6));
      lines.push(endTag(L2, 'visual'));

    // Case B: Manual
    } else if (visMode.startsWith('Manual')) {
      lines.push(startTag(L2, 'visual'));
      const shape = visMode.split('(')[1].replace(')', '').trim();
      const vx = (j.vis_x || 0) / 1000.0;
      const vy = (j.vis_y || 0) / 1000.0;
      const vz = (j.vis_z || 0) / 1000.0;
      const vr = degToRad(j.vis_roll || 0);
      const vp = degToRad(j.vis_pitch || 0);
      const vyaw = degToRad(j.vis_yaw || 0);
      lines.push(tag(L3, 'origin', `xyz="${vx} ${vy} ${vz}" rpy="${fmt4(vr)} ${fmt4(vp)} ${fmt4(vyaw)}"`));
      lines.push(startTag(L3, 'geometry'));

      // Manual dims are already in mm - convert to meters
      const d1 = (j.vis_dim1 || 40) / 1000.0;
      const d2 = (j.vis_dim2 || 100) / 1000.0;
      const d3 = (j.vis_dim3 || 40) / 1000.0;

      if (shape === 'Box') lines.push(tag(L4, 'box', `size="${d1} ${d2} ${d3}"`));
      else if (shape === 'Sphere') lines.push(tag(L4, 'sphere', `radius="${d1}"`));
      else lines.push(tag(L4, 'cylinder', `radius="${d1}" length="${d2}"`));

      lines.push(endTag(L3, 'geometry'));
      lines.push(materialTag(L3, `mat_${i}`, 0.6, 0.6, 0.6));
      lines.push(endTag(L2, 'visual'));

    // Case C: Auto or None
    } else if (visMode !== 'None') {
      const nextJoints = childMap[cLink] || [];

      if (nextJoints.length === 0) {
        // Leaf node: small red sphere
        lines.push(startTag(L2, 'visual'));
        lines.push(tag(L3, 'origin', 'xyz="0 0 0" rpy="0 0 0"'));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'sphere', 'radius="0.02"'));
        lines.push(endTag(L3, 'geometry'));
        lines.push(startTag(L3, 'material', `name="end_effector_${i}"`));
        lines.push(tag(L4, 'color', 'rgba="1.0 0.0 0.0 1.0"'));
        lines.push(endTag(L3, 'material'));
        lines.push(endTag(L2, 'visual'));
      } else {
        // Color based on index
        let r = (i * 37 % 100) / 100.0;
        let g = (i * 59 % 100) / 100.0;
        let b = (i * 83 % 100) / 100.0;
        if (r + g + b < 1.0) { r += 0.2; g += 0.2; b += 0.2; }

        for (const nj of nextJoints) {
          // nj x/y/z in mm, convert to meters for geometry calculation
          const dx = (nj.x || 0) / 1000.0;
          const dy = (nj.y || 0) / 1000.0;
          const dz = (nj.z || 0) / 1000.0;

          lines.push(startTag(L2, 'visual'));

          if (visMode === 'Auto (Box)') {
            const { center: [cx, cy, cz], dims: [lx, ly, lz] } = calcBoxGeometry(dx, dy, dz);
            lines.push(tag(L3, 'origin', `xyz="${fmt4(cx)} ${fmt4(cy)} ${fmt4(cz)}" rpy="0 0 0"`));
            lines.push(startTag(L3, 'geometry'));
            lines.push(tag(L4, 'box', `size="${fmt4(lx)} ${fmt4(ly)} ${fmt4(lz)}"`));
            lines.push(endTag(L3, 'geometry'));
          } else {
            // Auto (Cylinder)
            const { center: [cx, cy, cz], rotation: [rr, pp, yy], dims: [ln, rad] } = calcCylinderGeometry(dx, dy, dz);
            lines.push(tag(L3, 'origin', `xyz="${fmt4(cx)} ${fmt4(cy)} ${fmt4(cz)}" rpy="${fmt4(rr)} ${fmt4(pp)} ${fmt4(yy)}"`));
            lines.push(startTag(L3, 'geometry'));
            lines.push(tag(L4, 'cylinder', `radius="${fmt4(rad)}" length="${fmt4(ln)}"`));
            lines.push(endTag(L3, 'geometry'));
          }

          lines.push(materialTag(L3, `mat_branch_${i}`, fmt4(r), fmt4(g), fmt4(b)));
          lines.push(endTag(L2, 'visual'));
        }
      }
    }

    // Collision
    if (j.col_enabled) {
      lines.push(startTag(L2, 'collision'));
      const cx = (j.col_x || 0) / 1000.0;
      const cy = (j.col_y || 0) / 1000.0;
      const cz = (j.col_z || 0) / 1000.0;
      const cr = degToRad(j.col_roll || 0);
      const cp = degToRad(j.col_pitch || 0);
      const cyaw = degToRad(j.col_yaw || 0);
      lines.push(tag(L3, 'origin', `xyz="${cx} ${cy} ${cz}" rpy="${fmt4(cr)} ${fmt4(cp)} ${fmt4(cyaw)}"`));
      lines.push(startTag(L3, 'geometry'));
      const cType = j.col_type || 'Cylinder';
      const cd1 = (j.col_dim1 || 40) / 1000.0;
      const cd2 = (j.col_dim2 || 100) / 1000.0;
      const cd3 = (j.col_dim3 || 40) / 1000.0;
      if (cType === 'Box') lines.push(tag(L4, 'box', `size="${cd1} ${cd2} ${cd3}"`));
      else if (cType === 'Sphere') lines.push(tag(L4, 'sphere', `radius="${cd1}"`));
      else lines.push(tag(L4, 'cylinder', `radius="${cd1}" length="${cd2}"`));
      lines.push(endTag(L3, 'geometry'));
      lines.push(endTag(L2, 'collision'));
    }

    // Sphere pack collisions
    if (j.col_spheres && j.col_spheres.length > 0) {
      j.col_spheres.forEach((sp, si) => {
        const sx = (sp.x || 0) / 1000.0;
        const sy = (sp.y || 0) / 1000.0;
        const sz = (sp.z || 0) / 1000.0;
        const sr = (sp.radius || 0.02) / 1000.0;
        lines.push(startTag(L2, 'collision', `name="sphere_col_${si}"`));
        lines.push(tag(L3, 'origin', `xyz="${fmt4(sx)} ${fmt4(sy)} ${fmt4(sz)}" rpy="0 0 0"`));
        lines.push(startTag(L3, 'geometry'));
        lines.push(tag(L4, 'sphere', `radius="${fmt4(sr)}"`));
        lines.push(endTag(L3, 'geometry'));
        lines.push(endTag(L2, 'collision'));
      });
    }

    // Inertia — matched by child link name
    const d = getInertia(cLink);
    if (d) {
      lines.push(inertialTag(L2,
        d.mass ?? d.m ?? 1.0,
        [d.com_x ?? d.x ?? 0, d.com_y ?? d.y ?? 0, d.com_z ?? d.z ?? 0],
        d.ixx ?? 0.01, d.ixy ?? 0, d.ixz ?? 0,
        d.iyy ?? 0.01, d.iyz ?? 0, d.izz ?? 0.01
      ));
    } else {
      lines.push(inertialTag(L2));
    }

    lines.push(endTag(L1, 'link'));
  }

  lines.push(endTag(L0, 'robot'));
  return lines.join('\n');
}
