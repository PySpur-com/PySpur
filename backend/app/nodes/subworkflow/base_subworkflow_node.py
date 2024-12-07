from abc import ABC, abstractmethod
import json
from typing import Any, Dict, Set, Tuple

from pydantic import BaseModel

from ...execution.node_executor import NodeExecutor
from ...schemas.workflow_schemas import WorkflowDefinitionSchema, WorkflowNodeSchema
from ..base import BaseNode


class BaseSubworkflowNodeConfig(BaseModel, ABC):
    workflow_json: str


class BaseSubworkflowNode(BaseNode, ABC):
    name: str = "static_workflow_node"
    config_model = BaseSubworkflowNodeConfig

    def setup(self) -> None:
        config = self.config
        if not self.subworkflow:
            self.subworkflow = self._parse_workflow_json(config.workflow_json)
        self._node_dict: Dict[str, WorkflowNodeSchema] = {
            node.id: node for node in self.subworkflow.nodes
        }
        self._dependencies: Dict[str, Set[str]] = self._build_dependencies()
        # Collect input and output schemas
        input_schema = self._collect_input_schema()
        output_schema = self._collect_output_schema()

        # Create input_model and output_model dynamically
        self.input_model = self.get_model_for_schema_dict(
            input_schema, f"{self.name}Input"
        )
        self.output_model = self.get_model_for_schema_dict(
            output_schema, f"{self.name}Output"
        )

    def _parse_workflow_json(self, workflow_json_str: str) -> WorkflowDefinitionSchema:
        # Parse the JSON string into a Workflow object
        workflow_dict = json.loads(workflow_json_str)
        return WorkflowDefinitionSchema.model_validate(workflow_dict)

    def _build_dependencies(self) -> Dict[str, Set[str]]:
        assert self.subworkflow is not None
        dependencies: Dict[str, Set[str]] = {
            node.id: set() for node in self.subworkflow.nodes
        }
        for link in self.subworkflow.links:
            dependencies[link.target_id].add(link.source_id)
        return dependencies

    def _collect_input_schema(self) -> Dict[str, str]:
        """
        input schema of a workflow is the schema of the input node of the workflow
        """
        assert self.subworkflow is not None
        # find the input node
        input_node = None
        for node in self.subworkflow.nodes:
            if node.node_type == "InputNode":
                input_node = node
                break
        if input_node is None:
            raise ValueError("Input node not found in the workflow")
        return input_node.config.get("input_schema", {})

    def _collect_output_schema(self) -> Dict[str, str]:
        """
        If the workflow has an output node, the output schema of the workflow is the output schema of the output node.
        Otherwise, the output schema is the schema of the outputs of the nodes that are not consumed by other nodes.
        """
        assert self.subworkflow is not None
        # find the output node
        output_node = None
        for node in self.subworkflow.nodes:
            if node.node_type == "OutputNode":
                output_node = node
                break
        if output_node is not None:
            self._output_field_to_node_output: Dict[str, Tuple[str, str]] = {}
            for output_name, _field in output_node.config.get(
                "output_schema", {}
            ).items():
                self._output_field_to_node_output[output_name] = (
                    output_node.id,
                    output_name,
                )
            return output_node.config.get("output_schema", {})
        else:
            return self._collect_unused_output_schema()

    def _collect_unused_output_schema(self) -> Dict[str, str]:
        """
        Collects the outputs from the sub-workflow that are not consumed by other nodes.
        Also builds a mapping from output field names to node IDs and node output keys.
        """
        assert self.subworkflow is not None
        # Collect all consumed outputs
        all_consumed_sources: Set[Tuple[str, str]] = set()
        for link in self.subworkflow.links:
            all_consumed_sources.add((link.source_id, link.source_output_key))

        output_fields: Dict[str, str] = {}
        self._output_field_to_node_output: Dict[str, Tuple[str, str]] = {}
        for node_id, node in self._node_dict.items():
            node_executor = NodeExecutor(node)
            node_outputs = node_executor.node_instance.output_model.model_fields
            for output_name, field in node_outputs.items():
                # Check if this output is consumed
                if (node_id, output_name) not in all_consumed_sources:
                    field_name = f"{output_name}__{node_id}"
                    annotation = field.annotation
                    if annotation == None:
                        # Handle variadic outputs
                        continue
                    output_fields[field_name] = annotation.__name__
                    self._output_field_to_node_output[field_name] = (
                        node_id,
                        output_name,
                    )
        return output_fields

    def _transform_workflow_output_to_node_output(
        self, workflow_output: Dict[str, Any]
    ) -> BaseModel:
        """
        Transforms the output of the workflow to the output of the node.
        """
        # Extract outputs and return them
        output_data = {}
        for output_name in self.output_model.model_fields:
            node_id, node_output_key = self._output_field_to_node_output[output_name]
            node_output = workflow_output.get(node_id)
            if node_output is None:
                raise ValueError(f"No output from node {node_id}")
            value = getattr(node_output, node_output_key)
            output_data[output_name] = value

        return self.output_model.model_validate(output_data)

    @abstractmethod
    async def run(self, input_data: BaseModel) -> BaseModel:
        pass
