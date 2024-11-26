from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from pathlib import Path
import yaml
from typing import List, Dict, Any

from ..database import get_db
from ..models.workflow_model import WorkflowModel
from ..evals.evaluator import evaluate_model_on_dataset, load_yaml_config

router = APIRouter()

EVALS_DIR = Path(__file__).parent.parent / "evals" / "tasks"


@router.get("/", description="List all available evals")
def list_evals() -> List[Dict[str, Any]]:
    """
    List all available evals by scanning the tasks directory for YAML files.
    """
    evals = []
    if not EVALS_DIR.exists():
        raise HTTPException(status_code=500, detail="Evals directory not found")
    for eval_file in EVALS_DIR.glob("*.yaml"):
        try:
            eval_content = load_yaml_config(yaml_path=eval_file)
            metadata = eval_content.get("metadata", {})
            evals.append(
                {
                    "name": metadata.get("name", eval_file.stem),
                    "description": metadata.get("description", ""),
                    "type": metadata.get("type", "Unknown"),
                    "num_samples": metadata.get("num_samples", "N/A"),
                    "paper_link": metadata.get("paper_link", ""),
                    "file_name": eval_file.name,
                }
            )
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Error parsing {eval_file.name}: {e}"
            )
    return evals


@router.post("/launch/", description="Launch an eval job")
async def launch_eval(
    eval_name: str,
    workflow_id: str,
    output_variable: str,
    background_tasks: BackgroundTasks,
    num_samples: int = 10,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Launch an eval job by triggering the evaluator with the specified eval configuration.
    """
    # Validate workflow ID
    workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    eval_file = EVALS_DIR / f"{eval_name}.yaml"
    if not eval_file.exists():
        raise HTTPException(status_code=404, detail="Eval configuration not found")

    try:
        # Load the eval configuration
        task_config = load_yaml_config(eval_file)

        # Run the evaluation asynchronously
        results = await evaluate_model_on_dataset(
            task_config, num_samples=num_samples, output_variable=output_variable
        )

        return {
            "status": "success",
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error launching eval: {e}")