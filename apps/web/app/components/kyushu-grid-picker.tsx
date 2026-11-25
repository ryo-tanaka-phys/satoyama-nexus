'use client';

import { useState } from 'react';
import {
  findKyushuGridCell,
  KYUSHU_GRID_CELLS,
  resolvePostalCodeToGridCell
} from '@satoyama/domain';

interface KyushuGridPickerProps {
  selectedCellId: string;
  postalCode: string;
  onSelectCell: (cellId: string) => void;
  onChangePostalCode: (postalCode: string) => void;
}

export function KyushuGridPicker({
  selectedCellId,
  postalCode,
  onSelectCell,
  onChangePostalCode
}: KyushuGridPickerProps) {
  const [postalMessage, setPostalMessage] = useState<string | null>(null);
  const selectedCell = findKyushuGridCell(selectedCellId);

  function handlePostalLookup() {
    const matched = resolvePostalCodeToGridCell(postalCode);
    if (!matched) {
      setPostalMessage('該当する九州大学周辺エリアが見つかりませんでした。下の4×4グリッドから直接選択してください。');
      return;
    }
    onSelectCell(matched.id);
    setPostalMessage(`郵便番号から「${matched.label}」(${matched.id}) を選択しました。`);
  }

  return (
    <div className="grid-picker-box">
      <div className="grid-picker-header">
        <div>
          <strong>九州大学周辺 4×4 固定グリッド地図（模擬エリア・約1.5km刻み）</strong>
          <div className="muted-sm">
            好きな区画をクリックするだけで本拠地（実数値 SRID 4326 中心座標）が設定されます。
          </div>
        </div>
        <span className="badge badge-sim">↑ 北（今津湾・志摩方面）</span>
      </div>

      <div className="postal-row">
        <input
          type="text"
          value={postalCode}
          onChange={(e) => onChangePostalCode(e.target.value)}
          placeholder="任意・郵便番号補助（例: 819-0395, 819-0373）"
          aria-label="郵便番号補助"
        />
        <button type="button" className="btn-secondary" onClick={handlePostalLookup}>
          郵便番号から区画を選択
        </button>
      </div>
      {postalMessage && <p className="muted-sm" style={{ marginTop: 6 }}>{postalMessage}</p>}

      <div className="kyushu-grid-4x4" role="radiogroup" aria-label="九州大学周辺 4x4 固定グリッド">
        {KYUSHU_GRID_CELLS.map((cell) => {
          const isSelected = cell.id === selectedCellId;
          const isCampus = cell.id === 'grid-r1-c1' || cell.id === 'grid-r1-c2';
          return (
            <button
              key={cell.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                onSelectCell(cell.id);
                setPostalMessage(null);
              }}
              className={`grid-cell-btn ${isSelected ? 'grid-cell-selected' : ''} ${isCampus ? 'grid-cell-campus' : ''}`}
            >
              <span className="grid-cell-code">
                R{cell.row + 1}-C{cell.col + 1}
                {isCampus ? ' ★九大伊都' : ''}
              </span>
              <span className="grid-cell-label">{cell.label}</span>
              <span className="grid-cell-note">{cell.areaNote}</span>
            </button>
          );
        })}
      </div>

      {selectedCell && (
        <div className="grid-selected-summary">
          <span className="badge badge-ok">選択中</span>{' '}
          <strong>{selectedCell.label}</strong>（{selectedCell.areaNote}） — 内部座標:{' '}
          <code>
            {selectedCell.coordinates.latitude.toFixed(3)}, {selectedCell.coordinates.longitude.toFixed(3)} (SRID 4326)
          </code>
        </div>
      )}
    </div>
  );
}
