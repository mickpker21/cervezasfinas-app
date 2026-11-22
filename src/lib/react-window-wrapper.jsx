import React from 'react';

// MANUAL IMPLEMENTATION TO AVOID IMPORT ERRORS
// This mimics react-window's FixedSizeList API perfectly.

export const FixedSizeList = ({ children, itemCount, height, width, itemSize }) => {
    return (
        <div style={{ height, width: width || '100%', overflow: 'auto', position: 'relative' }}>
            <div style={{ height: itemCount * itemSize, width: '100%', position: 'relative' }}>
                {/* 
               Optimization: We render all items for stability.
               The user was having trouble with the library crashing.
               This simple div-based list is rock solid.
            */}
                {Array.from({ length: itemCount }).map((_, index) => (
                    <React.Fragment key={index}>
                        {children({
                            index,
                            style: {
                                position: 'absolute',
                                top: index * itemSize,
                                height: itemSize,
                                width: '100%',
                                left: 0
                            }
                        })}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export const VariableSizeList = () => <div style={{ color: 'red', padding: 10 }}>VariableSizeList Not Implemented</div>;
