import { MoveRight } from 'lucide-react';
import type { BalanceChange } from '../core/types';
import { changeLabel, collapseUnworded, DIRECTION_LABEL, formatDifference, hasPublishedValues, KIND_LABEL, SCOPE_LABEL, valueParts } from '../format';
import { DirectionLabel, DirectionMark } from './Direction';

const PLAIN_KINDS = new Set<BalanceChange['kind']>(['ability', 'base', 'fix']);

export function ChangeTags({ change }: { change: BalanceChange }) {
  return (
    <>
      {!PLAIN_KINDS.has(change.kind) && <span className="change-tag">{KIND_LABEL[change.kind]}</span>}
      {change.scope === '6v6' && <span className="change-tag change-tag--scope">{SCOPE_LABEL['6v6']}</span>}
      {change.queue !== 'all' && <span className="change-tag change-tag--scope">{change.queue === 'competitive' ? 'Competitive' : 'Quick Play'}</span>}
    </>
  );
}

/** Before, after and difference. Only ever published numbers. A missing previous value is said out loud. */
export function ChangeValues({ change }: { change: BalanceChange }) {
  const parts = valueParts(change);
  const difference = formatDifference(change);
  if (!hasPublishedValues(change)) return null;
  return (
    <span className="change__values">
      {parts.previous !== null && parts.next !== null ? (
        <>
          <span className="change__before">{parts.previous}</span>
          <MoveRight size={14} className="change__to" aria-hidden="true" />
          <span className="sr-only">to</span>
          <span className="change__after">{parts.next}</span>
        </>
      ) : parts.next !== null ? (
        <span className="change__after">Now {parts.next}</span>
      ) : null}
      {parts.qualifier && <span className="change__qualifier">{parts.qualifier}</span>}
      {difference && <span className="change__difference">{difference}</span>}
    </span>
  );
}

function resultText(change: BalanceChange) {
  return change.situational ? `Situational ${DIRECTION_LABEL[change.direction].toLowerCase()}` : DIRECTION_LABEL[change.direction];
}

/** One published change, as a compact row for hero cards. */
function ChangeRow({ change }: { change: BalanceChange }) {
  const label = changeLabel(change);
  return (
    <li className="change" data-direction={change.direction}>
      <DirectionMark direction={change.direction} />
      <div className="change__body">
        <p className="change__name">
          {change.ability && <b>{change.ability}</b>}
          {label && <span>{label}</span>}
          <ChangeTags change={change} />
        </p>
        <ChangeValues change={change} />
      </div>
      <span className="change__result"><span className="sr-only">Result: </span>{resultText(change)}</span>
    </li>
  );
}

const wordingText = (count: number) => (count === 1 ? "Wording on Blizzard's page" : `${count} changes, wording on Blizzard's page`);

export function ChangeRows({ changes, sourceUrl }: { changes: BalanceChange[]; sourceUrl: string }) {
  return (
    <ul className="change-list">
      {collapseUnworded(changes).map((item) =>
        item.type === 'line' ? (
          <ChangeRow key={item.change.id} change={item.change} />
        ) : (
          <li key={item.key} className="change" data-direction={item.first.direction}>
            <DirectionMark direction={item.first.direction} />
            <div className="change__body">
              <p className="change__name">
                {item.first.ability && <b>{item.first.ability}</b>}
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="change__source-link">{wordingText(item.count)}</a>
                <ChangeTags change={item.first} />
              </p>
            </div>
            <span className="change__result"><span className="sr-only">Result: </span>{resultText(item.first)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/** The fuller form for the hero panel, spelling out previous, new, change and classification. */
function ChangeDetail({ change }: { change: BalanceChange }) {
  const parts = valueParts(change);
  const difference = formatDifference(change);
  const label = changeLabel(change);
  const showValues = hasPublishedValues(change);
  return (
    <li className="change-detail" data-direction={change.direction}>
      <p className="change-detail__name">
        <span>{label ?? 'Change'}</span>
        <ChangeTags change={change} />
      </p>
      <dl className="change-detail__facts">
        {showValues && (
          <>
            <div>
              <dt>Previous</dt>
              <dd>{parts.previous ?? 'Not published'}</dd>
            </div>
            <div>
              <dt>New</dt>
              <dd>
                {parts.next ?? 'Not published'}
                {parts.qualifier ? ` ${parts.qualifier}` : ''}
              </dd>
            </div>
            <div>
              <dt>{change.changeBy !== null ? 'Stated change' : 'Change'}</dt>
              <dd>{difference ?? 'Not comparable'}</dd>
            </div>
          </>
        )}
        <div className="change-detail__result">
          <dt>Classification</dt>
          <dd>
            <DirectionLabel direction={change.direction} situational={change.situational} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function ChangeDetails({ changes, sourceUrl }: { changes: BalanceChange[]; sourceUrl: string }) {
  return (
    <ul>
      {collapseUnworded(changes).map((item) =>
        item.type === 'line' ? (
          <ChangeDetail key={item.change.id} change={item.change} />
        ) : (
          <li key={item.key} className="change-detail" data-direction={item.first.direction}>
            <p className="change-detail__name">
              <span>{item.count === 1 ? 'A change without comparable numbers' : `${item.count} changes without comparable numbers`}</span>
              <ChangeTags change={item.first} />
            </p>
            <p className="change-detail__note">
              The wording stays on <a href={sourceUrl} target="_blank" rel="noreferrer">Blizzard's page</a>, and {item.count === 1 ? 'this line has' : 'these lines have'} not been reviewed yet.
            </p>
            <dl className="change-detail__facts">
              <div className="change-detail__result">
                <dt>Classification</dt>
                <dd><DirectionLabel direction={item.first.direction} /></dd>
              </div>
            </dl>
          </li>
        ),
      )}
    </ul>
  );
}
