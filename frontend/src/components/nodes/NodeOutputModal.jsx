import React from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@nextui-org/react';
import NodeOutputDisplay from './NodeOutputDisplay'; // Import NodeOutputDisplay

const NodeOutputModal = ({ isOpen, onOpenChange, title, node }) => {
    const handleOpenChange = () => {
        onOpenChange(false);
    };

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="5xl">
            <ModalContent>
            <ModalHeader>
                <h3>{title}</h3>
            </ModalHeader>
            <ModalBody>
                <div className='py-5'>
                {node ? (
                    <NodeOutputDisplay node={node} /> // Reuse NodeOutputDisplay for rendering
                ) : (
                    <div>No output available</div>
                )}
                </div>
            </ModalBody>
            <ModalFooter>
                <Button onPress={handleOpenChange} auto>
                    Close
                </Button>
            </ModalFooter>
            </ModalContent>
        </Modal>
    );
};

export default NodeOutputModal;
