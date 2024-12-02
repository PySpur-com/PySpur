import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import RunViewFlowCanvas from '../../components/canvas/RunViewFlowCanvas' // Import the FlowCanvas component
import Header from '../../components/Header'; // Import the Header component
import { PersistGate } from 'redux-persist/integration/react'; // Import PersistGate
import { persistor } from '../../store/store'; // Import the persistor
import { useDispatch } from 'react-redux'; // Import useDispatch from react-redux
import LoadingSpinner from '../../components/LoadingSpinner';
import { fetchNodeTypes } from '../../store/nodeTypesSlice';
import { setTestInputs } from '../../store/flowSlice'; // Import setTestInputs action
import { getRunStatus } from '../../utils/api';

const TracePage = () => {

  const dispatch = useDispatch(); 
  const router = useRouter();
  const { id } = router.query;
  const [workflowData, setWorkflowData] = useState(null);
  const [nodeOutputs, setNodeOutputs] = useState({});
  const [workflowId, setWorkflowId] = useState(null);

  useEffect(() => {
    dispatch(fetchNodeTypes());
    const fetchRun = async () => {
      try {
        const data = await getRunStatus(id);
        console.log('Run Data:', data);
        setWorkflowId(data.workflow_id);
        setWorkflowData(data.workflow_version);

        if (data.workflow_version && data.workflow_version.definition) {
          dispatch(setTestInputs(data.workflow_version.definition.test_inputs));
          if (data.outputs) {
            setNodeOutputs(data.outputs);
          }
        }

      } catch (error) {
        console.error('Error fetching run:', error);
      }
    };
    if (id) {
      fetchRun();
    }
  }, [id, dispatch]);

  if (!workflowData) {
    return <LoadingSpinner />;
  }

  return (
    <PersistGate loading={null} persistor={persistor}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header activePage="workflow" style={{ position: 'sticky', top: 0, zIndex: 10 }} />
        <div style={{ flexGrow: 1 }}>
          <RunViewFlowCanvas workflowData={workflowData} nodeOutputs={nodeOutputs} workflowID={workflowId} />
        </div>
      </div>
    </PersistGate>
  );
};

export default TracePage;