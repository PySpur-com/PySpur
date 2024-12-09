import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import BaseNode from '../BaseNode';
import styles from '../DynamicNode.module.css';

interface NodeConfig {
  branch_refs: string[];
  [key: string]: any;
}

interface NodeData {
  config?: NodeConfig;
  title?: string;
  color?: string;
  [key: string]: any;
}

interface MergeNodeProps {
  id: string;
  data: NodeData;
  selected?: boolean;
}

interface Node {
  id: string;
  data: NodeData;
  [key: string]: any;
}

const MergeNode: React.FC<MergeNodeProps> = ({ id, data, selected }) => {
  const edges = useSelector((state: RootState) => state.flow.edges);
  const nodes = useSelector((state: RootState) => state.flow.nodes) as Node[];
  const [isCollapsed, setIsCollapsed] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [nodeWidth, setNodeWidth] = useState<string>('auto');

  // Get incoming branches based on connected edges, ensuring uniqueness
  const incomingBranches = useMemo(() => {
    const branchMap = new Map();

    edges
      .filter(edge => edge.target === id)
      .forEach(edge => {
        const sourceNode = nodes.find(node => node.id === edge.source);
        // Only add if we haven't seen this source ID before
        if (!branchMap.has(edge.source)) {
          branchMap.set(edge.source, {
            id: edge.source,
            sourceHandle: edge.sourceHandle,
            label: sourceNode?.data?.config?.title || sourceNode?.id || 'Unknown Source'
          });
        }
      });

    return Array.from(branchMap.values());
  }, [edges, nodes, id]);

  // Calculate nodeWidth based on title length
  useEffect(() => {
    if (!nodeRef.current || !data) return;

    const titleLength = ((data?.title || data?.config?.title || '').length + 10) * 1.25;

    const minNodeWidth = 300;
    const maxNodeWidth = 600;

    const finalWidth = Math.min(
      Math.max(titleLength * 10, minNodeWidth),
      maxNodeWidth
    );

    setNodeWidth(`${finalWidth}px`);
  }, [data]);

  return (
    <div className={styles.dynamicNodeWrapper}>
      <BaseNode
        id={id}
        data={data}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        style={{ width: nodeWidth }}
        className="hover:!bg-background"
      >
        <div className={styles.nodeWrapper} ref={nodeRef}>
          <div className="flex flex-col gap-3">
            {!isCollapsed && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500">
                      Incoming Branches ({incomingBranches.length})
                    </div>
                  </div>

                  {incomingBranches.length === 0 ? (
                    <div className="text-xs text-gray-400 italic p-2 border border-dashed border-gray-200 rounded-md text-center">
                      Connect branches to continue the flow
                    </div>
                  ) : (
                    incomingBranches.map((branch) => (
                      <div key={branch.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                        <div className="text-sm">
                          <span className="font-medium">{branch.label}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {/* Handles - now always visible */}
            <div className={styles.handlesWrapper}>
              <div className={`${styles.handlesColumn} ${styles.inputHandlesColumn}`}>
                <div className={`${styles.handleRow} w-full justify-start`}>
                  <div className={`${styles.handleCell} ${styles.inputHandleCell}`}>
                    <Handle
                      type="target"
                      position={Position.Left}
                      id="input"
                      className={`${styles.handle} ${styles.handleLeft} ${isCollapsed ? styles.collapsedHandleInput : ''}`}
                    />
                  </div>
                </div>
              </div>

              <div className={`${styles.handlesColumn} ${styles.outputHandlesColumn}`}>
                <div className={`${styles.handleRow} w-full justify-end`}>
                  <div className={`${styles.handleCell} ${styles.outputHandleCell}`}>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id="result"
                      className={`${styles.handle} ${styles.handleRight} ${isCollapsed ? styles.collapsedHandleOutput : ''}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </BaseNode>
    </div>
  );
};

export default MergeNode;
