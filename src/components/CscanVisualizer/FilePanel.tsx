import React, { useCallback, useRef, useState } from 'react';
import { Upload, File, Check, Trash2, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { CscanData } from './types';

interface FilePanelProps {
  files: CscanData[];
  selectedFiles: Set<string>;
  currentFileId?: string;
  onFileSelect: (fileId: string) => void;
  onFileUpload: (files: File[]) => void;
  onSelectionChange: (selected: Set<string>) => void;
  onCreateComposite?: () => void;
  onClearFiles?: () => void;
}

const FilePanel: React.FC<FilePanelProps> = ({
  files,
  selectedFiles,
  currentFileId,
  onFileSelect,
  onFileUpload,
  onSelectionChange,
  onCreateComposite,
  onClearFiles
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['recent']));

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      onFileUpload(droppedFiles);
    }
  }, [onFileUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFileUpload(Array.from(e.target.files));
    }
  }, [onFileUpload]);

  const toggleSelection = useCallback((fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    onSelectionChange(newSelection);
  }, [selectedFiles, onSelectionChange]);

  const selectAll = useCallback(() => {
    if (selectedFiles.size === files.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(files.map(f => f.id)));
    }
  }, [files, selectedFiles, onSelectionChange]);

  const toggleGroup = useCallback((groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  }, [expandedGroups]);

  // Group files by date or category
  const groupedFiles = React.useMemo(() => {
    const groups: Record<string, CscanData[]> = {
      recent: [],
      older: []
    };

    const now = new Date();
    files.forEach(file => {
      const fileDate = file.timestamp || new Date();
      const hoursDiff = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        groups.recent.push(file);
      } else {
        groups.older.push(file);
      }
    });

    return groups;
  }, [files]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Upload Area */}
      <div
        className={`
          m-3 p-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer
          ${isDragging
            ? 'border-blue-500'
            : 'border-gray-600 hover:border-gray-500'}
        `}
        style={{ backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.1)' : '#111827' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.csv,.json"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-xs text-center text-gray-400">
          Drop files or click to browse
        </p>
      </div>

      {/* Quick Actions */}
      {files.length > 0 && (
        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              {selectedFiles.size === files.length ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={onClearFiles}
              className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          </div>
          {selectedFiles.size > 0 && (
            <span className="text-xs text-gray-500">
              {selectedFiles.size} selected
            </span>
          )}
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto px-2">
        {Object.entries(groupedFiles).map(([groupId, groupFiles]) => {
          if (groupFiles.length === 0) return null;

          const isExpanded = expandedGroups.has(groupId);

          return (
            <div key={groupId} className="mb-2">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(groupId)}
                className="w-full flex items-center gap-1 px-2 py-1 hover:bg-gray-700/50 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-gray-500" />
                )}
                <span className="text-xs text-gray-400 font-medium uppercase">
                  {groupId === 'recent' ? 'Recent Files' : 'Older Files'}
                </span>
                <span className="text-xs text-gray-500 ml-auto">
                  ({groupFiles.length})
                </span>
              </button>

              {/* Group Files */}
              {isExpanded && (
                <div className="mt-1 space-y-0.5">
                  {groupFiles.map(file => (
                    <div
                      key={file.id}
                      className={`
                        group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer
                        ${file.id === currentFileId
                          ? 'bg-blue-600/30 border-l-2 border-blue-500'
                          : selectedFiles.has(file.id)
                          ? 'bg-blue-600/20 hover:bg-blue-600/30'
                          : 'hover:bg-gray-700/50'}
                        transition-colors
                      `}
                      onClick={() => onFileSelect(file.id)}
                    >
                      {/* Checkbox - Made larger and more visible */}
                      <input
                        type="checkbox"
                        checked={selectedFiles.has(file.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelection(file.id, e as unknown as React.MouseEvent);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer flex-shrink-0"
                      />

                      {/* File Icon */}
                      <File className="w-4 h-4 text-gray-400 flex-shrink-0" />

                      {/* File Name */}
                      <span className="text-xs text-gray-300 truncate flex-1">
                        {file.filename}
                      </span>

                      {/* Actions (visible on hover) */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle delete
                          }}
                          className="p-0.5 hover:bg-red-600/50 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {files.length === 0 && (
          <div className="text-center py-8">
            <Layers className="w-12 h-12 mx-auto mb-2 text-gray-600" />
            <p className="text-xs text-gray-500">No files loaded</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {files.length > 0 && (
        <div className="p-3 border-t border-gray-700 space-y-2">
          {/* Composite Button */}
          {files.length >= 2 && (
            <button
              onClick={onCreateComposite}
              className="w-full px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
            >
              {selectedFiles.size > 1
                ? `Create Composite (${selectedFiles.size} selected)`
                : `Create Composite (All ${files.length} files)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FilePanel;