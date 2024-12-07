import React from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { Card, Button } from '@nextui-org/react';
import { Icon } from "@iconify/react";
import TipPopup from '../../../TipPopUp';

const ZoomInOut: React.FC = () => {
  const { zoomIn, zoomOut } = useReactFlow();
  const { zoom } = useViewport();

  // Create handler functions to fix the type errors
  const handleZoomIn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    zoomIn();
  };

  const handleZoomOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    zoomOut();
  };

  return (
    <Card className='flex items-center justify-center shadow-none'>
      <div className="zoom-controls flex items-center gap-2">
        <TipPopup title='Zoom Out' shortcuts={['ctrl', '-']}>
          <Button isIconOnly variant="light" onClick={handleZoomOut}>
            <Icon icon="solar:minimize-square-linear" width={16} className="text-default-500" />
          </Button>
        </TipPopup>
        <span className="text-sm text-default-500">{(zoom * 100).toFixed(0)}%</span>
        <TipPopup title='Zoom In' shortcuts={['ctrl', '+']}>
          <Button isIconOnly variant="light" onClick={handleZoomIn}>
            <Icon icon="solar:maximize-square-linear" width={16} className="text-default-500" />
          </Button>
        </TipPopup>
      </div>
    </Card>
  );
};

export default ZoomInOut;