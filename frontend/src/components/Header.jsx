import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Input,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Link,
  Button,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Code,
  Tooltip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import SettingsCard from './settings/Settings';
import { setProjectName, updateNodeData, resetRun } from '../store/flowSlice'; // Ensure updateNodeData is imported
import RunModal from './RunModal';
import { getRunStatus, startRun, getWorkflow } from '../utils/api';
import { Toaster, toast } from 'sonner'
import { getWorkflowRuns } from '../utils/api';
import { useRouter } from 'next/router';

const Header = ({ activePage }) => {
  const dispatch = useDispatch();
  const nodes = useSelector((state) => state.flow.nodes);
  const projectName = useSelector((state) => state.flow.projectName);
  const [isRunning, setIsRunning] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [workflowRuns, setWorkflowRuns] = useState([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const workflowId = useSelector((state) => state.flow.workflowID);

  const router = useRouter();
  const { id } = router.query;
  const isRun = id && id[0] == 'R';

  let currentStatusInterval = null;

  const fetchWorkflowRuns = async () => {
    try {
      const response = await getWorkflowRuns(workflowId);
      setWorkflowRuns(response);
    }
    catch (error) {
      console.error('Error fetching workflow runs:', error);
    }
  };

  useEffect(() => {
    if (workflowId) {
      fetchWorkflowRuns();
    }
  }, [workflowId]);

  const updateWorkflowStatus = async (runID) => {
    let pollCount = 0;
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    currentStatusInterval = setInterval(async () => {
      try {
        const statusResponse = await getRunStatus(runID);
        const outputs = statusResponse.outputs;

        if (statusResponse.status === 'FAILED') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.error('Workflow run failed.');
          return;
        }

        // Update nodes based on outputs
        if (outputs) {
          Object.entries(outputs).forEach(([nodeId, output_values]) => {
            const node = nodes.find((node) => node.id === nodeId);
            if (output_values) {
              dispatch(updateNodeData({ id: nodeId, data: { run: { ...node.data.run, ...output_values } } }));
            }
          });
        }

        if (statusResponse.status !== 'RUNNING') {
          setIsRunning(false);
          clearInterval(currentStatusInterval);
          toast.success('Workflow run completed.');
        }

        pollCount += 1;
      } catch (error) {
        console.error('Error fetching workflow status:', error);
        clearInterval(currentStatusInterval);
      }
    }, 1000);
  };


  const executeWorkflow = async (inputValues) => {
    try {
      toast('Starting workflow run...');
      const result = await startRun(workflowId, inputValues, null, 'interactive');
      console.log('Workflow run started:', result);
      setIsRunning(true);
      fetchWorkflowRuns();
      dispatch(resetRun());
      updateWorkflowStatus(result.id);
    } catch (error) {
      console.error('Error starting workflow run:', error);
      toast.error('Error starting workflow run.');
    }
  };

  const handleRunWorkflow = async () => {
    setIsDebugModalOpen(true);
  };

  const handleStopWorkflow = () => {
    setIsRunning(false);
    if (currentStatusInterval) {
      clearInterval(currentStatusInterval);
    }
    toast('Workflow run stopped.');
  };

  const handleProjectNameChange = (e) => {
    dispatch(setProjectName(e.target.value));
  };

  const handleDownloadWorkflow = async () => {
    try {
      // Get the current workflow using the workflowID from Redux state
      const workflow = await getWorkflow(workflowId);

      const workflowDetails = {
        name: workflow.name,
        definition: workflow.definition,
        description: workflow.description
      };

      // Create a JSON blob from the workflow data
      const blob = new Blob([JSON.stringify(workflowDetails, null, 2)], {
        type: 'application/json'
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}.json`; // Use project name for the file

      // Trigger download
      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading workflow:', error);
      // You might want to add some user feedback here
    }
  };

  const handleDeploy = () => {
    setIsDeployModalOpen(true);
  };

  const getApiEndpoint = () => {
    if (typeof window === 'undefined') {
      return ''; // Return empty string during server-side rendering
    }
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/wf/${workflowId}/start_run/?run_type=non_blocking`;
  };

  const workflowInputVariables = useSelector((state) => state.flow.workflowInputVariables);

  const DeployModal = () => {
    // Create example request body with the actual input variables
    const exampleRequestBody = {
      initial_inputs: Object.keys(workflowInputVariables).reduce((acc, key) => {
        // Create an example value based on the variable type
        acc[key] = workflowInputVariables[key].type === 'number' ? 0 :
          workflowInputVariables[key].type === 'boolean' ? false :
            "example_value";
        return acc;
      }, {})
    };

    return (
      <Modal
        isOpen={isDeployModalOpen}
        onOpenChange={setIsDeployModalOpen}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader>API Endpoint Information</ModalHeader>
          <ModalBody>
            <p>Use this endpoint to run your workflow in a non-blocking way:</p>
            <div className="flex items-center gap-2 w-full">
              <Code className="w-full overflow-x-auto whitespace-nowrap">
                {getApiEndpoint()}
              </Code>
              <Tooltip content="Copy to clipboard">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(getApiEndpoint());
                  }}
                >
                  <Icon icon="solar:copy-linear" width={20} />
                </Button>
              </Tooltip>
            </div>
            <p className="mt-2">Send a POST request with the following body:</p>
            <div className="flex items-center gap-2 w-full">
              <Code className="w-full overflow-x-auto whitespace-pre">
                {JSON.stringify(exampleRequestBody, null, 2)}
              </Code>
              <Tooltip content="Copy to clipboard">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(exampleRequestBody, null, 2));
                  }}
                >
                  <Icon icon="solar:copy-linear" width={20} />
                </Button>
              </Tooltip>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={() => setIsDeployModalOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  };

  return (
    <>
      <Toaster richColors position="bottom-right" />
      <Navbar
        classNames={{
          base: "lg:bg-background lg:backdrop-filter-none h-12 mt-1 shadow-sm",
          wrapper: "px-4 sm:px-6",
          item: [
            "flex",
            "relative",
            "h-full",
            "items-center",
            "data-[active=true]:after:content-['']",
            "data-[active=true]:after:absolute",
            "data-[active=true]:after:bottom-0",
            "data-[active=true]:after:left-0",
            "data-[active=true]:after:right-0",
            "data-[active=true]:after:h-[2px]",
            "data-[active=true]:after:rounded-[2px]",
            "data-[active=true]:after:bg-primary",
            "data-[active=true]:text-primary",
          ],
        }}
      >
        <NavbarBrand
          justify="start"
          className="h-12 max-w-fit"
        >
          {activePage === "home" ? (
            <p className="font-bold text-inherit cursor-pointer">PySpur</p>
          ) : (
            <Link href="/" className="cursor-pointer">
              <p className="font-bold text-inherit">PySpur</p>
            </Link>
          )}
        </NavbarBrand>

        {activePage === "workflow" && (
          <NavbarContent
            className="h-12 rounded-full bg-content2 dark:bg-content1 sm:flex"
            id="workflow-title"
            justify="start"
          >
            <Input
              className="px-4"
              type="text"
              placeholder="Project Name"
              value={projectName}
              onChange={handleProjectNameChange}
            />
          </NavbarContent>
        )}
        <NavbarContent
          className="h-12 gap-4 rounded-full bg-content2 px-4 dark:bg-content1 max-w-fit"
          justify="end"
          id="home-editor-nav"
        >
          <NavbarItem isActive={activePage === "home"}>
            <Link className="flex gap-2 text-inherit" href="/">
              Home
            </Link>
          </NavbarItem>
          {activePage === "workflow" && (
            <NavbarItem isActive={activePage === "workflow"}>
              Editor
            </NavbarItem>
          )}
          <NavbarItem isActive={activePage === "evals"}>
            <Link className="flex gap-2 text-inherit" href="/evals">
              Evals
            </Link>
          </NavbarItem>
        </NavbarContent>
        {activePage === "workflow" && (
          <NavbarContent
            className="ml-auto flex h-12 max-w-fit items-center gap-0 rounded-full p-0 lg:bg-content2 lg:px-1 lg:dark:bg-content1"
            justify="end"
            id="workflow-actions-buttons"
          >
            {!isRun && (
              <>
                {isRunning ? (
                  <>
                    <NavbarItem className="hidden sm:flex">
                      <Spinner size="sm" />
                    </NavbarItem>
                    <NavbarItem className="hidden sm:flex">
                      <Button isIconOnly radius="full" variant="light" onClick={handleStopWorkflow}>
                        <Icon className="text-default-500" icon="solar:stop-linear" width={22} />
                      </Button>
                    </NavbarItem>
                  </>
                ) : (
                  <NavbarItem className="hidden sm:flex">
                    <Button isIconOnly radius="full" variant="light" onClick={handleRunWorkflow}>
                      <Icon className="text-default-500" icon="solar:play-linear" width={22} />
                    </Button>
                  </NavbarItem>
                )}
              </>
            )}
            <NavbarItem className="hidden sm:flex">
              <Dropdown isOpen={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <DropdownTrigger>
                  <Button isIconOnly radius="full" variant="light">
                    <Icon className="text-default-500" icon="solar:history-linear" width={22} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu>
                  {workflowRuns.map((run, index) => (
                    <DropdownItem
                      key={index}
                      onClick={() => window.open(`/trace/${run.id}`, '_blank')}
                      textValue={`Version ${index + 1}`}
                    >
                      Run {workflowRuns.length - index}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDownloadWorkflow}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:download-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <Button
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleDeploy}
              >
                <Icon
                  className="text-default-500"
                  icon="solar:cloud-upload-linear"
                  width={24}
                />
              </Button>
            </NavbarItem>
            <NavbarItem className="hidden sm:flex">
              <SettingsCard />
            </NavbarItem>
          </NavbarContent>
        )}
      </Navbar>
      <RunModal
        isOpen={isDebugModalOpen}
        onOpenChange={setIsDebugModalOpen}
        onRun={async (selectedInputs) => {
          await executeWorkflow(selectedInputs);
          setIsDebugModalOpen(false);
        }}
      />
      <DeployModal />
    </>
  );
};

export default Header;