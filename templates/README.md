{
  "name": "Example text2image (API format stub)",
  "description": "Minimal example — replace workflow_json with your ComfyUI Export (API Format) JSON.",
  "bindings": {
    "promptNodeId": "6",
    "promptInputKey": "text",
    "negativePromptNodeId": "7",
    "negativePromptInputKey": "text",
    "frameCountNodeId": "5",
    "frameCountInputKey": "batch_size",
    "seedNodeId": "3",
    "seedInputKey": "seed",
    "outputNodeIds": ["9"],
    "controls": [
      {
        "id": "checkpoint",
        "label": "Checkpoint",
        "type": "checkpoint",
        "nodeId": "4",
        "inputKey": "ckpt_name"
      }
    ]
  }
}
