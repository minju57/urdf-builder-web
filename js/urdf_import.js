// urdf_import.js - Port of urdf_importer.py URDFImporter

function radToDeg(rad) {
  return parseFloat(rad) * (180.0 / Math.PI);
}

// Get direct child elements by tag name
function directChildren(elem, tagName) {
  if (!elem) return [];
  const result = [];
  for (const child of elem.children) {
    if (child.tagName && child.tagName.toLowerCase() === tagName.toLowerCase()) {
      result.push(child);
    }
  }
  return result;
}

function directChild(elem, tagName) {
  return directChildren(elem, tagName)[0] || null;
}

function parseOriginElem(elem) {
  if (!elem) return { xyz: [0, 0, 0], rpy: [0, 0, 0] };
  const origin = directChild(elem, 'origin');
  if (!origin) return { xyz: [0, 0, 0], rpy: [0, 0, 0] };

  const xyzStr = (origin.getAttribute('xyz') || '0 0 0').trim().split(/\s+/);
  const rpyStr = (origin.getAttribute('rpy') || '0 0 0').trim().split(/\s+/);
  return {
    xyz: xyzStr.map(v => parseFloat(v) || 0),
    rpy: rpyStr.map(v => parseFloat(v) || 0)
  };
}

function parseGeometryElem(geomElem) {
  if (!geomElem) return { gType: 'None', dims: [0, 0, 0], path: '' };

  const mesh = directChild(geomElem, 'mesh');
  if (mesh) {
    const filename = mesh.getAttribute('filename') || '';
    return { gType: 'Mesh', dims: [0, 0, 0], path: filename };
  }

  const box = directChild(geomElem, 'box');
  if (box) {
    const s = (box.getAttribute('size') || '0.1 0.1 0.1').trim().split(/\s+/).map(v => parseFloat(v) || 0);
    return { gType: 'Box', dims: [s[0] * 1000, s[1] * 1000, s[2] * 1000], path: '' };
  }

  const cylinder = directChild(geomElem, 'cylinder');
  if (cylinder) {
    const r = parseFloat(cylinder.getAttribute('radius') || '0.05') * 1000;
    const l = parseFloat(cylinder.getAttribute('length') || '0.1') * 1000;
    return { gType: 'Cylinder', dims: [r, l, 0], path: '' };
  }

  const sphere = directChild(geomElem, 'sphere');
  if (sphere) {
    const r = parseFloat(sphere.getAttribute('radius') || '0.05') * 1000;
    return { gType: 'Sphere', dims: [r, 0, 0], path: '' };
  }

  return { gType: 'None', dims: [0, 0, 0], path: '' };
}

function parseURDF(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    console.error('URDF parse error:', parseErr.textContent);
    return { joints: [], baseJoint: null };
  }

  const root = doc.documentElement;

  // Collect links
  const linksDict = {};
  for (const link of directChildren(root, 'link')) {
    const name = link.getAttribute('name');
    if (name) linksDict[name] = link;
  }

  const jointElems = directChildren(root, 'joint');

  // Find base joint
  let baseJointOriginXYZ = [0.0, 0.0, 1.0];
  let baseJointOriginRPY = [0.0, 0.0, 0.0];
  let baseMode = 'Fixed';
  let foundBaseJoint = false;

  for (const joint of jointElems) {
    const jname = joint.getAttribute('name') || '';
    if (jname === 'world_to_base' || jname === 'floating_base') {
      foundBaseJoint = true;
      baseMode = (jname === 'world_to_base') ? 'Fixed' : 'Floating';
      const origin = directChild(joint, 'origin');
      if (origin) {
        baseJointOriginXYZ = (origin.getAttribute('xyz') || '0 0 1').trim().split(/\s+/).map(v => parseFloat(v) || 0);
        baseJointOriginRPY = (origin.getAttribute('rpy') || '0 0 0').trim().split(/\s+/).map(v => parseFloat(v) || 0);
      }
      break;
    }
  }

  const jointsData = [];

  for (const joint of jointElems) {
    const jname = joint.getAttribute('name') || '';

    // Skip world_to_base / floating_base
    if (jname === 'world_to_base' || jname === 'floating_base') continue;

    const jType = joint.getAttribute('type') || 'revolute';
    const parentElem = directChild(joint, 'parent');
    const childElem = directChild(joint, 'child');
    const pLink = parentElem ? (parentElem.getAttribute('link') || '') : '';
    const cLink = childElem ? (childElem.getAttribute('link') || '') : '';

    const { xyz, rpy } = parseOriginElem(joint);

    const data = {
      name: jname,
      parent: pLink,
      child: cLink,
      type: jType,
      axis: 'Roll',
      x: xyz[0] * 1000, y: xyz[1] * 1000, z: xyz[2] * 1000,
      r: radToDeg(rpy[0]), p: radToDeg(rpy[1]), yaw: radToDeg(rpy[2]),
      low: -180.0, up: 180.0,
      vis_type: 'Auto (Cylinder)', vis_mesh: '',
      vis_dim1: 0, vis_dim2: 0, vis_dim3: 0,
      vis_x: 0, vis_y: 0, vis_z: 0,
      vis_roll: 0, vis_pitch: 0, vis_yaw: 0,
      col_enabled: false, col_type: 'Cylinder',
      col_dim1: 0, col_dim2: 0, col_dim3: 0,
      col_x: 0, col_y: 0, col_z: 0,
      col_roll: 0, col_pitch: 0, col_yaw: 0
    };

    // Axis
    const axisElem = directChild(joint, 'axis');
    if (jType === 'fixed') {
      data.axis = 'Fixed';
    } else if (axisElem) {
      const raw = (axisElem.getAttribute('xyz') || '1 0 0').trim().split(/\s+/).map(v => parseFloat(v) || 0);
      const len = Math.sqrt(raw[0] ** 2 + raw[1] ** 2 + raw[2] ** 2) || 1;
      const axVec = raw.map(v => v / len);
      if (Math.abs(axVec[1]) > 0.9) data.axis = 'Pitch';
      else if (Math.abs(axVec[2]) > 0.9) data.axis = 'Yaw';
      else data.axis = 'Roll';
    }

    // Limits
    const limitElem = directChild(joint, 'limit');
    if (limitElem) {
      const lower = limitElem.getAttribute('lower');
      const upper = limitElem.getAttribute('upper');
      if (lower) data.low = radToDeg(parseFloat(lower));
      if (upper) data.up = radToDeg(parseFloat(upper));
    }

    // Visual/Collision from child link
    if (cLink && linksDict[cLink]) {
      const linkObj = linksDict[cLink];

      const vis = directChild(linkObj, 'visual');
      if (vis) {
        const { xyz: vxyz, rpy: vrpy } = parseOriginElem(vis);
        data.vis_x = vxyz[0] * 1000;
        data.vis_y = vxyz[1] * 1000;
        data.vis_z = vxyz[2] * 1000;
        data.vis_roll = radToDeg(vrpy[0]);
        data.vis_pitch = radToDeg(vrpy[1]);
        data.vis_yaw = radToDeg(vrpy[2]);

        const geomElem = directChild(vis, 'geometry');
        const { gType, dims, path } = parseGeometryElem(geomElem);
        if (gType === 'Mesh') {
          data.vis_type = 'Mesh';
          data.vis_mesh = path;
        } else if (gType !== 'None') {
          data.vis_type = `Manual (${gType})`;
          data.vis_dim1 = dims[0];
          data.vis_dim2 = dims[1];
          data.vis_dim3 = dims[2];
        }
      }

      const cols = directChildren(linkObj, 'collision');
      data.col_spheres = [];
      if (cols.length > 0) {
        const firstCol = cols[0];
        const firstGeomElem = directChild(firstCol, 'geometry');
        const firstGeom = parseGeometryElem(firstGeomElem);
        if (firstGeom.gType !== 'Sphere') {
          data.col_enabled = true;
          const { xyz: cxyz, rpy: crpy } = parseOriginElem(firstCol);
          data.col_x = cxyz[0] * 1000;
          data.col_y = cxyz[1] * 1000;
          data.col_z = cxyz[2] * 1000;
          data.col_roll = radToDeg(crpy[0]);
          data.col_pitch = radToDeg(crpy[1]);
          data.col_yaw = radToDeg(crpy[2]);
          if (firstGeom.gType !== 'None' && firstGeom.gType !== 'Mesh') {
            data.col_type = firstGeom.gType;
            data.col_dim1 = firstGeom.dims[0];
            data.col_dim2 = firstGeom.dims[1];
            data.col_dim3 = firstGeom.dims[2];
          }
        }
        cols.forEach(col => {
          const geomElem = directChild(col, 'geometry');
          const { gType, dims } = parseGeometryElem(geomElem);
          if (gType === 'Sphere') {
            const { xyz: cxyz } = parseOriginElem(col);
            data.col_spheres.push({
              x: cxyz[0] * 1000,
              y: cxyz[1] * 1000,
              z: cxyz[2] * 1000,
              radius: dims[0]
            });
          }
        });
      }
    }

    jointsData.push(data);
  }

  // Base joint
  if (!foundBaseJoint) {
    return { joints: jointsData, baseJoint: { no_base: true } };
  }

  const baseJoint = getDefaultBaseJoint();
  baseJoint.mode = baseMode;
  baseJoint.name = (baseMode === 'Fixed') ? 'world_to_base' : 'floating_base';
  baseJoint.x = baseJointOriginXYZ[0] * 1000.0;
  baseJoint.y = baseJointOriginXYZ[1] * 1000.0;
  baseJoint.z = baseJointOriginXYZ[2] * 1000.0;
  baseJoint.r = radToDeg(baseJointOriginRPY[0]);
  baseJoint.p = radToDeg(baseJointOriginRPY[1]);
  baseJoint.yaw = radToDeg(baseJointOriginRPY[2]);

  // Parse base_link visual/collision
  const baseLinkName = 'base_link';
  if (linksDict[baseLinkName]) {
    const bl = linksDict[baseLinkName];

    const vis = directChild(bl, 'visual');
    if (vis) {
      const { xyz: vxyz, rpy: vrpy } = parseOriginElem(vis);
      baseJoint.vis_x = vxyz[0] * 1000;
      baseJoint.vis_y = vxyz[1] * 1000;
      baseJoint.vis_z = vxyz[2] * 1000;
      baseJoint.vis_roll = radToDeg(vrpy[0]);
      baseJoint.vis_pitch = radToDeg(vrpy[1]);
      baseJoint.vis_yaw = radToDeg(vrpy[2]);

      const geomElem = directChild(vis, 'geometry');
      const { gType, dims, path } = parseGeometryElem(geomElem);
      if (gType === 'Mesh') {
        baseJoint.vis_type = 'Mesh';
        baseJoint.vis_mesh = path;
      } else if (gType !== 'None') {
        baseJoint.vis_type = `Manual (${gType})`;
        baseJoint.vis_dim1 = dims[0];
        baseJoint.vis_dim2 = dims[1];
        baseJoint.vis_dim3 = dims[2];
      }
    }

    const baseCols = directChildren(bl, 'collision');
    baseJoint.col_spheres = [];
    if (baseCols.length > 0) {
      const firstCol = baseCols[0];
      const firstGeomElem = directChild(firstCol, 'geometry');
      const firstGeom = parseGeometryElem(firstGeomElem);
      if (firstGeom.gType !== 'Sphere') {
        baseJoint.col_enabled = true;
        const { xyz: cxyz, rpy: crpy } = parseOriginElem(firstCol);
        baseJoint.col_x = cxyz[0] * 1000;
        baseJoint.col_y = cxyz[1] * 1000;
        baseJoint.col_z = cxyz[2] * 1000;
        baseJoint.col_roll = radToDeg(crpy[0]);
        baseJoint.col_pitch = radToDeg(crpy[1]);
        baseJoint.col_yaw = radToDeg(crpy[2]);
        if (firstGeom.gType !== 'None' && firstGeom.gType !== 'Mesh') {
          baseJoint.col_type = firstGeom.gType;
          baseJoint.col_dim1 = firstGeom.dims[0];
          baseJoint.col_dim2 = firstGeom.dims[1];
          baseJoint.col_dim3 = firstGeom.dims[2];
        }
      }
      baseCols.forEach(col => {
        const geomElem = directChild(col, 'geometry');
        const { gType, dims } = parseGeometryElem(geomElem);
        if (gType === 'Sphere') {
          const { xyz: cxyz } = parseOriginElem(col);
          baseJoint.col_spheres.push({
            x: cxyz[0] * 1000,
            y: cxyz[1] * 1000,
            z: cxyz[2] * 1000,
            radius: dims[0]
          });
        }
      });
    }
  }

  return { joints: jointsData, baseJoint };
}
