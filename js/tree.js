// tree.js - Tree diagram rendering using dagre.js

function drawTree(joints, selectedIndex, baseState) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 20,
    ranksep: 40,
    marginx: 20,
    marginy: 20
  });

  const hasBase = baseState != null && !baseState.no_base;

  // Node dimensions
  const NODE_W = 160;
  const NODE_H = 50;
  const JOINT_W = 170;
  const JOINT_H = 55;
  const ROOT_W = 100;
  const ROOT_H = 40;

  if (hasBase) {
    const mode = baseState.mode || 'Fixed';
    const rootLink = (mode === 'Fixed') ? 'world' : 'base';
    const baseJointName = baseState.name || 'world_to_base';

    // Root link node
    g.setNode(rootLink, {
      label: rootLink,
      nodeType: 'root',
      width: ROOT_W,
      height: ROOT_H
    });

    // Base joint node
    const isBaseSelected = (selectedIndex === -3);
    const baseLabelText = `${baseJointName}\n[${mode}]\nxyz: ${(baseState.x || 0).toFixed(1)}, ${(baseState.y || 0).toFixed(1)}, ${(baseState.z || 0).toFixed(1)}`;
    g.setNode('BASE_JOINT_NODE', {
      label: baseLabelText,
      nodeType: 'base_joint',
      isSelected: isBaseSelected,
      jointIdx: -3,
      width: JOINT_W,
      height: JOINT_H
    });

    g.setEdge(rootLink, 'BASE_JOINT_NODE');
    g.setEdge('BASE_JOINT_NODE', 'base_link');

    // base_link node
    g.setNode('base_link', {
      label: 'base_link',
      nodeType: 'base_link',
      jointIdx: -2,
      width: NODE_W,
      height: NODE_H
    });
  }

  // Collect all regular links
  const childSet = new Set(joints.map(j => j.child));
  let allLinks = new Set();
  for (const j of joints) {
    allLinks.add(j.parent);
    allLinks.add(j.child);
  }

  if (hasBase) {
    allLinks.delete('base_link');
  } else {
    // Find root links (not a child of any joint)
    const rootLinks = new Set([...allLinks].filter(l => !childSet.has(l)));
    for (const rl of rootLinks) {
      if (!g.hasNode(rl)) {
        g.setNode(rl, {
          label: rl,
          nodeType: 'root',
          width: ROOT_W,
          height: ROOT_H
        });
      }
    }
    for (const rl of rootLinks) allLinks.delete(rl);
  }

  // Add regular link nodes
  for (const link of allLinks) {
    const linkJointIdx = joints.findIndex(j => j.child === link);
    g.setNode(link, {
      label: link,
      nodeType: 'link',
      jointIdx: linkJointIdx !== -1 ? -(linkJointIdx + 10) : undefined,
      width: NODE_W,
      height: NODE_H
    });
  }

  // Add regular joint nodes and edges
  for (let i = 0; i < joints.length; i++) {
    const j = joints[i];
    const jointNodeId = `J_NODE_${i}`;
    const isSelected = (i === selectedIndex);
    const labelText = `${j.name}\n[${j.axis}]\nxyz: ${(j.x || 0).toFixed(1)}, ${(j.y || 0).toFixed(1)}, ${(j.z || 0).toFixed(1)}`;

    g.setNode(jointNodeId, {
      label: labelText,
      nodeType: 'joint',
      isSelected: isSelected,
      jointIdx: i,
      width: JOINT_W,
      height: JOINT_H
    });

    const parent = j.parent || (hasBase ? 'base_link' : 'root');
    if (g.hasNode(parent)) g.setEdge(parent, jointNodeId);
    if (g.hasNode(j.child)) g.setEdge(jointNodeId, j.child);
  }

  // Run layout
  dagre.layout(g);

  // Build SVG
  const graphData = g.graph();
  const svgW = (graphData.width || 400) + 40;
  const svgH = (graphData.height || 200) + 40;

  let svgParts = [];
  svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="font-family: Arial, sans-serif;">`);
  svgParts.push(`<defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#95a5a6"/>
    </marker>
  </defs>`);
  svgParts.push(`<g transform="translate(20,20)">`);

  // Draw edges first
  for (const e of g.edges()) {
    const edge = g.edge(e);
    if (!edge || !edge.points) continue;
    const points = edge.points.map(p => `${p.x},${p.y}`).join(' ');
    svgParts.push(`<polyline points="${points}" fill="none" stroke="#95a5a6" stroke-width="1.5" marker-end="url(#arrowhead)"/>`);
  }

  // Draw nodes
  for (const nodeId of g.nodes()) {
    const node = g.node(nodeId);
    if (!node) continue;

    const nx = node.x - node.width / 2;
    const ny = node.y - node.height / 2;
    const nw = node.width;
    const nh = node.height;
    const cx = node.x;
    const cy = node.y;

    let extraAttrs = '';
    if (node.jointIdx !== undefined && node.jointIdx !== null) {
      extraAttrs = `data-joint-idx="${node.jointIdx}" style="cursor:pointer;"`;
    }

    if (node.nodeType === 'root') {
      // Octagon shape approximation with polygon
      const pts = octagonPoints(cx, cy, nw / 2, nh / 2);
      svgParts.push(`<polygon points="${pts}" fill="#2c3e50" stroke="none" ${extraAttrs}/>`);
      svgParts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="white" font-size="11" font-family="Arial" pointer-events="none">${escapeXml(node.label)}</text>`);

    } else if (node.nodeType === 'base_joint') {
      const fill = node.isSelected ? '#1a5276' : '#2e86c1';
      const stroke = node.isSelected ? '#1a5276' : 'none';
      const strokeW = node.isSelected ? '2.5' : '0';
      svgParts.push(`<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" ${extraAttrs}/>`);
      renderMultilineText(svgParts, node.label, cx, ny + 12, 'white', '10', nw - 10, extraAttrs);

    } else if (node.nodeType === 'base_link') {
      svgParts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${nw / 2}" ry="${nh / 2}" fill="#ecf0f1" stroke="none" ${extraAttrs}/>`);
      svgParts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#7f8c8d" font-size="10" font-family="Arial" pointer-events="none">${escapeXml(node.label)}</text>`);

    } else if (node.nodeType === 'joint') {
      const fill = node.isSelected ? '#e67e22' : '#f39c12';
      const stroke = node.isSelected ? '#d35400' : 'none';
      const strokeW = node.isSelected ? '2.5' : '0';
      svgParts.push(`<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" ${extraAttrs}/>`);
      renderMultilineText(svgParts, node.label, cx, ny + 12, 'white', '10', nw - 10, extraAttrs);

    } else if (node.nodeType === 'link') {
      svgParts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${nw / 2}" ry="${nh / 2}" fill="#ecf0f1" stroke="none" ${extraAttrs}/>`);
      svgParts.push(`<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#7f8c8d" font-size="10" font-family="Arial" pointer-events="none">${escapeXml(node.label)}</text>`);
    }
  }

  svgParts.push('</g></svg>');
  return svgParts.join('\n');
}

function octagonPoints(cx, cy, rx, ry) {
  const cut = 0.3;
  const pts = [
    [cx - rx + rx * cut, cy - ry],
    [cx + rx - rx * cut, cy - ry],
    [cx + rx, cy - ry + ry * cut],
    [cx + rx, cy + ry - ry * cut],
    [cx + rx - rx * cut, cy + ry],
    [cx - rx + rx * cut, cy + ry],
    [cx - rx, cy + ry - ry * cut],
    [cx - rx, cy - ry + ry * cut]
  ];
  return pts.map(p => `${p[0]},${p[1]}`).join(' ');
}

function renderMultilineText(svgParts, label, cx, startY, color, fontSize, maxWidth, extraAttrs) {
  const lines = label.split('\n');
  const lineH = parseInt(fontSize) + 4;
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineH;
    svgParts.push(`<text x="${cx}" y="${y}" text-anchor="middle" fill="${color}" font-size="${fontSize}" font-family="Arial" pointer-events="none">${escapeXml(lines[i])}</text>`);
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
