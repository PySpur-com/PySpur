import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, Background, ReactFlowProvider, Node, Edge, NodeChange, EdgeChange, Connection, OnNodesChange, OnEdgesChange, OnConnect, NodeTypes, EdgeTypes, ReactFlowInstance, XYPosition } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSelector, useDispatch } from 'react-redux';
import Operator from './footer/Operator';
import {
  nodesChange,
  edgesChange,
  connect,
  setSelectedNode,
  deleteNode,
  setWorkflowInputVariable,
  updateNodeData,
  setNodes,
} from '../../store/flowSlice';
import NodeSidebar from '../nodes/nodeSidebar/NodeSidebar';
import { Dropdown, DropdownMenu, DropdownSection, DropdownItem } from '@nextui-org/react';
import DynamicNode from '../nodes/DynamicNode';
import { v4 as uuidv4 } from 'uuid';
import { addNodeBetweenNodes } from './AddNodePopoverCanvas';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import CustomEdge from './edges/CustomEdge';
import { getHelperLines } from '../../utils/helperLines';
import HelperLinesRenderer from '../HelperLines';
import useCopyPaste from '../../utils/useCopyPaste';
import { useModeStore } from '../../store/modeStore';
import { initializeFlow } from '../../store/flowSlice';
import InputNode from '../nodes/InputNode';
import { IfElseNode } from '../nodes/logic/IfElseNode';
import MergeNode from '../nodes/logic/MergeNode';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import LoadingSpinner from '../LoadingSpinner';
import dagre from '@dagrejs/dagre';
import CollapsibleNodePanel from '../nodes/CollapsibleNodePanel';

// Type definitions
interface NodeTypesConfig {
  [category: string]: Array<{
    name: string;
    [key: string]: any;
  }>;
}

interface WorkflowData {
  definition: {
    nodes: Array<{
      node_type: string;
      config: {
        input_schema?: {
          [key: string]: string;
        };
      };
    }>;
  };
}

interface FlowCanvasProps {
  workflowData?: WorkflowData;
  workflowID?: string;
}

interface HelperLines {
  horizontal: number | null;
  vertical: number | null;
}

interface RootState {
  nodeTypes: {
    data: NodeTypesConfig;
  };
  flow: {
    nodes: Node[];
    edges: Edge[];
    selectedNode: string | null;
  };
}

const useNodeTypes = ({ nodeTypesConfig }: { nodeTypesConfig: NodeTypesConfig | undefined }) => {
  const nodeTypes = useMemo<NodeTypes>(() => {
    if (!nodeTypesConfig) return {};
    return Object.keys(nodeTypesConfig).reduce<NodeTypes>((acc, category) => {
      nodeTypesConfig[category].forEach(node => {
        if (node.name === 'InputNode') {
          acc[node.name] = InputNode;
        } else if (node.name === 'IfElseNode') {
          acc[node.name] = IfElseNode;
        } else if (node.name === 'MergeNode') {
          acc[node.name] = MergeNode;
        } else {
          acc[node.name] = (props: any) => {
            return <DynamicNode {...props} type={node.name} />;
          };
        }
      });
      return acc;
    }, {});
  }, [nodeTypesConfig]);

  const isLoading = !nodeTypesConfig;
  return { nodeTypes, isLoading };
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

// Create a wrapper component that includes ReactFlow logic
const FlowCanvasContent: React.FC<FlowCanvasProps> = (props) => {
  const { workflowData, workflowID } = props;
  const dispatch = useDispatch();

  const nodeTypesConfig = useSelector((state: RootState) => state.nodeTypes.data);

  useEffect(() => {
    if (workflowData) {
      console.log('workflowData', workflowData);
      if (workflowData.definition.nodes) {
        const inputNode = workflowData.definition.nodes.filter(node => node.node_type === 'InputNode');
        if (inputNode.length > 0) {
          const inputSchema = inputNode[0].config.input_schema;
          if (inputSchema) {
            const workflowInputVariables = Object.entries(inputSchema).map(([key, type]) => {
              return { key, value: '' };
            });
            workflowInputVariables.forEach(variable => {
              dispatch(setWorkflowInputVariable(variable));
            });
          }
        }
      }
      dispatch(initializeFlow({ nodeTypes: nodeTypesConfig, ...workflowData, workflowID }));
    }
  }, [dispatch, workflowData, workflowID, nodeTypesConfig]);

  const { nodeTypes, isLoading } = useNodeTypes({ nodeTypesConfig });

  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const selectedNodeID = useSelector((state: RootState) => state.flow.selectedNode);

  const saveWorkflow = useSaveWorkflow([nodes, edges], 10000);

  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [helperLines, setHelperLines] = useState<HelperLines>({ horizontal: null, vertical: null });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [isPopoverContentVisible, setPopoverContentVisible] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNode: Node; targetNode: Node; edgeId: string } | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const showHelperLines = false;

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!changes.some((c) => c.type === 'position')) {
        setHelperLines({ horizontal: null, vertical: null });
        dispatch(nodesChange({ changes }));
        return;
      }

      const positionChange = changes.find(
        (c): c is NodeChange & { type: 'position'; position: XYPosition } =>
          c.type === 'position' && c.position !== undefined
      );

      if (positionChange && showHelperLines) {
        const { horizontal, vertical } = getHelperLines(positionChange, nodes);
        setHelperLines({ horizontal, vertical });

        if (horizontal || vertical) {
          const snapPosition = { x: positionChange.position.x, y: positionChange.position.y };
          if (horizontal) snapPosition.y = horizontal;
          if (vertical) snapPosition.x = vertical;
          positionChange.position = snapPosition;
        }
      }

      dispatch(nodesChange({ changes }));
    },
    [dispatch, nodes, showHelperLines]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => dispatch(edgesChange({ changes })),
    [dispatch]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.targetHandle || connection.targetHandle === 'node-body') {
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);

        if (sourceNode && targetNode) {
          const outputHandleName = connection.sourceHandle;

          if (!outputHandleName) {
            console.error('Source handle is not specified.');
            return;
          }

          const updatedInputSchema = {
            ...targetNode.data?.config?.input_schema,
            [outputHandleName]: 'str',
          };

          dispatch(
            updateNodeData({
              id: targetNode.id,
              data: {
                config: {
                  ...targetNode.data?.config,
                  input_schema: updatedInputSchema,
                },
              },
            })
          );

          connection = {
            ...connection,
            targetHandle: outputHandleName,
          };
        }
      }

      const newEdge: Edge = {
        ...connection,
        id: uuidv4(),
        key: uuidv4(),
      };
      dispatch(connect({ connection: newEdge }));
    },
    [dispatch, nodes]
  );

  const handlePopoverOpen = useCallback(({ sourceNode, targetNode, edgeId }: { sourceNode: Node; targetNode: Node; edgeId: string }) => {
    if (!reactFlowInstance) return;

    const centerX = (sourceNode.position.x + targetNode.position.x) / 2;
    const centerY = (sourceNode.position.y + targetNode.position.y) / 2;

    const screenPos = reactFlowInstance.flowToScreenPosition({
      x: centerX,
      y: centerY,
    });

    setPopoverPosition({
      x: screenPos.x,
      y: screenPos.y
    });
    setSelectedEdge({ sourceNode, targetNode, edgeId });
    setPopoverContentVisible(true);
  }, [reactFlowInstance]);

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      type: 'custom',
      style: {
        stroke: 'gray',
        strokeWidth: edge.id === hoveredEdge
          ? 4
          : edge.source === hoveredNode || edge.target === hoveredNode
            ? 4
            : 2,
      },
      data: {
        ...edge.data,
        showPlusButton: edge.id === hoveredEdge,
        onPopoverOpen: handlePopoverOpen,
      },
      key: edge.id,
    }));
  }, [edges, hoveredNode, hoveredEdge, handlePopoverOpen]);

  const onEdgeMouseEnter = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setHoveredEdge(edge.id);
    },
    []
  );

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
    instance.setViewport({ x: 0, y: 0, zoom: 0.8 });
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      dispatch(setSelectedNode({ nodeId: node.id }));
    },
    [dispatch]
  );

  const onPaneClick = useCallback(() => {
    if (selectedNodeID) {
      dispatch(setSelectedNode({ nodeId: null }));
    }
  }, [dispatch, selectedNodeID]);

  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      deletedNodes.forEach((node) => {
        dispatch(deleteNode({ nodeId: node.id }));

        if (selectedNodeID === node.id) {
          dispatch(setSelectedNode({ nodeId: null }));
        }
      });
    },
    [dispatch, selectedNodeID]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isFlowCanvasFocused = (event.target as HTMLElement).closest('.react-flow');
      if (!isFlowCanvasFocused) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter(node => node.selected);
        if (selectedNodes.length > 0) {
          onNodesDelete(selectedNodes);
        }
      }
    },
    [nodes, onNodesDelete]
  );

  const getLayoutedNodes = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({
      rankdir: direction,
      align: 'UL',
      edgesep: 10,
      ranksep: 128,
      nodesep: 128,
    });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    nodes.forEach((node) => {
      if (node.measured) {
        dagreGraph.setNode(node.id, { width: node.measured.width, height: node.measured.height });
      }
    });

    const nodeWeights: { [key: string]: number } = {};
    const edgeWeights: { [key: string]: number } = {};

    nodes.forEach(node => {
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      if (incomingEdges.length === 0) {
        nodeWeights[node.id] = 1024;
        const outgoingEdges = edges.filter(edge => edge.source === node.id);
        outgoingEdges.forEach(edge => {
          edgeWeights[edge.id] = 512;
        });
      }
    });

    // Perform a topological sort to determine the order of processing nodes
    let sortedNodes: Node[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: Node) => {
      if (visited.has(node.id)) {
        return;
      }
      if (visiting.has(node.id)) {
        throw new Error('Graph has cycles');
      }
      visiting.add(node.id);
      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      outgoingEdges.forEach(edge => {
        const targetNode = nodes.find(n => n.id === edge.target);
        if (targetNode) {
          visit(targetNode);
        }
      });
      visiting.delete(node.id);
      visited.add(node.id);
      sortedNodes.push(node);
    };

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        visit(node);
      }
    });

    sortedNodes = sortedNodes.reverse();

    sortedNodes.forEach(node => {
      const incomingEdges = edges.filter(edge => edge.target === node.id);
      let maxIncomingWeight = -Infinity;

      if (incomingEdges.length > 0) {
        maxIncomingWeight = incomingEdges.reduce((maxWeight, edge) => {
          return Math.max(maxWeight, edgeWeights[edge.id] || -Infinity);
        }, -Infinity);

        nodeWeights[node.id] = (maxIncomingWeight !== -Infinity) ? maxIncomingWeight : 2;
      } else {
        nodeWeights[node.id] = 2;
      }

      const outgoingEdges = edges.filter(edge => edge.source === node.id);
      outgoingEdges.forEach(edge => {
        edgeWeights[edge.id] = nodeWeights[node.id] * 2;
      });
    });

    edges.forEach((edge) => {
      const weight = edgeWeights[edge.id] || 1;
      dagreGraph.setEdge(edge.source, edge.target, { weight, height: 10, width: 10, labelpos: 'c', minlen: 1 });
    });

    dagre.layout(dagreGraph);

    return nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      if (!nodeWithPosition) return node;

      return {
        ...node,
        position: {
          x: nodeWithPosition.x - (node.measured?.width || 0) / 2,
          y: nodeWithPosition.y - (node.measured?.height || 0) / 2,
        },
      };
    });
  };

  const handleLayout = useCallback(() => {
    const layoutedNodes = getLayoutedNodes(nodes, edges);
    dispatch(setNodes({ nodes: layoutedNodes }));
  }, [nodes, edges, dispatch]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useKeyboardShortcuts(selectedNodeID, nodes, dispatch);

  const { cut, copy, paste, bufferedNodes } = useCopyPaste();
  useCopyPaste();

  const proOptions = {
    hideAttribution: true
  };

  const mode = useModeStore((state) => state.mode);

  const nodesWithMode = useMemo(() => {
    return nodes
      .filter(Boolean)
      .map(node => ({
        ...node,
        draggable: true,
        selectable: mode === 'pointer',
        position: node?.position,
        type: node?.type,
        data: node?.data,
      }));
  }, [nodes, mode]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNode(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {isPopoverContentVisible && selectedEdge && (
        <div
          style={{
            position: 'absolute',
            left: `${popoverPosition.x}px`,
            top: `${popoverPosition.y}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
          }}
        >
          <Dropdown
            isOpen={isPopoverContentVisible}
            onOpenChange={setPopoverContentVisible}
            placement="bottom"
          >
            <DropdownMenu>
              {nodeTypesConfig && Object.keys(nodeTypesConfig).map((category) => (
                <DropdownSection key={category} title={category} showDivider>
                  {nodeTypesConfig[category].map((node) => (
                    <DropdownItem
                      key={node.name}
                      onClick={() =>
                        addNodeBetweenNodes(
                          nodeTypesConfig,
                          node.name,
                          selectedEdge.sourceNode,
                          selectedEdge.targetNode,
                          selectedEdge.edgeId,
                          reactFlowInstance,
                          dispatch,
                          setPopoverContentVisible
                        )
                      }
                    >
                      {node.config.title}
                    </DropdownItem>
                  ))}
                </DropdownSection>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      )}

      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            overflow: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <ReactFlow
            nodes={nodesWithMode}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            onInit={onInit}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            proOptions={proOptions}
            panOnDrag={mode === 'hand' && !nodes.filter(Boolean).some(n => n.selected)}
            panOnScroll={true}
            zoomOnScroll={true}
            minZoom={0.1}
            maxZoom={2}
            selectionMode={mode === 'pointer' ? 1 : 0}
            selectNodesOnDrag={mode === 'pointer'}
            selectionOnDrag={mode === 'pointer'}
            selectionKeyCode={mode === 'pointer' ? null : false}
            multiSelectionKeyCode={mode === 'pointer' ? null : false}
            deleteKeyCode="Delete"
            nodesConnectable={true}
            connectionMode="loose"
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
            snapToGrid={true}
            snapGrid={[25, 25]}
          >
            <Background />
            {showHelperLines && (
              <HelperLinesRenderer
                horizontal={helperLines.horizontal}
                vertical={helperLines.vertical}
              />
            )}
            <Operator handleLayout={handleLayout} />
          </ReactFlow>
        </div>
        {selectedNodeID && (
          <div
            className="absolute top-0 right-0 h-full bg-white border-l border-gray-200"
            style={{ zIndex: 2 }}
          >
            <NodeSidebar nodeID={selectedNodeID} />
          </div>
        )}
        <div className="border-gray-200 absolute top-4 left-4" style={{ zIndex: 2 }}>
          <CollapsibleNodePanel />
        </div>
      </div>
    </div>
  );
};

// Main component that provides the ReactFlow context
const FlowCanvas: React.FC<FlowCanvasProps> = ({ workflowData, workflowID }) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent workflowData={workflowData} workflowID={workflowID} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;