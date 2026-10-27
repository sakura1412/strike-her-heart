"""Validate source-linked claims; file hashes do not prove semantic truth."""
import hashlib
from datetime import datetime
from pathlib import Path

FIELDS = ('content', 'function', 'limits', 'navigation')
MATRIX = {
    'DOM_OBSERVED': {'visible_content', 'dom_constraint', 'declared_destination'},
    'INTERACTION_VERIFIED': {'observed_behavior', 'permission_outcome', 'observed_effect'},
    'DOCUMENT_SUPPORTED': {'specification'},
    'INFERRED': set(), 'UNKNOWN': set(),
}


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def check_annotation(annotation, root):
    issues = []
    records = annotation.get('claimRecords') or {}
    sources = annotation.get('claimSources') or {}
    fields = annotation.get('fields') or {}
    identity = annotation.get('identity') or {}
    for field in FIELDS:
        value = fields.get(field, '')
        if not isinstance(value, str):
            issues.append(field + ': invalid text')
            continue
        claims = records.get(field, []) if isinstance(records, dict) else []
        if not isinstance(claims, list) or not claims:
            issues.append(field + ': no source-linked claims')
            continue
        if ''.join(c.get('text', '') for c in claims if isinstance(c, dict)) != value:
            issues.append(field + ': claims do not cover current text exactly')
        for claim in claims:
            if not isinstance(claim, dict):
                issues.append(field + ': invalid claim')
                continue
            text = claim.get('text')
            typ = claim.get('type')
            if not isinstance(text, str) or claim.get('textSha256') != sha(text):
                issues.append(field + ': claim text changed')
            if typ not in MATRIX or claim.get('kind') not in MATRIX[typ]:
                issues.append(field + ': unsupported or unconfirmed evidence type/kind')
            if claim.get('controlFingerprint') != identity.get('selector_fingerprint') or not identity.get('selector_fingerprint'):
                issues.append(field + ': claim belongs to another control identity')
            if typ == 'DOCUMENT_SUPPORTED' and (claim.get('scope') != 'specification' or claim.get('derivation') != 'explicit'):
                issues.append(field + ': document evidence requires an explicit specification, not inference')
            if typ == 'INTERACTION_VERIFIED' and claim.get('scope') != 'observed_session':
                issues.append(field + ': interaction evidence requires its observed session scope')
            refs = claim.get('sourceRefs')
            if not isinstance(refs, list) or not refs:
                issues.append(field + ': missing source references')
                continue
            for ref in refs:
                source = sources.get(ref) if isinstance(sources, dict) else None
                if not isinstance(source, dict) or source.get('type') != typ or not source.get('locator'):
                    issues.append(field + ': missing or mismatched source')
                    continue
                if typ == 'INTERACTION_VERIFIED' and not all(source.get(k) for k in ('action', 'result', 'observedAt')):
                    issues.append(field + ': incomplete interaction source')
                if typ == 'INTERACTION_VERIFIED':
                    try:
                        observed = datetime.fromisoformat(source.get('observedAt', '').replace('Z', '+00:00'))
                        if observed.tzinfo is None:
                            raise ValueError('timezone missing')
                    except (TypeError, ValueError):
                        issues.append(field + ': invalid interaction time')
                if typ == 'DOCUMENT_SUPPORTED' and not all(isinstance(source.get(k), str) and source.get(k).strip() for k in ('version', 'quote')):
                    issues.append(field + ': incomplete document source')
                if typ == 'DOM_OBSERVED' and (not isinstance(source.get('fact'), dict) or not source['fact'].get('attribute') or 'value' not in source['fact']):
                    issues.append(field + ': missing observed DOM fact')
                try:
                    target = (Path(root) / source['path']).resolve()
                    relative = target.relative_to(Path(root).resolve())
                    if relative.name in ('task.json', '.task.lock', 'workflow.html') or '.history' in relative.parts or '?' in str(relative) or '#' in str(relative):
                        raise ValueError('task records cannot be used as sources')
                    if not target.is_file() or target.stat().st_size > 10 * 1024 * 1024:
                        raise ValueError('source missing or too large')
                    content = target.read_bytes()
                    if hashlib.sha256(content).hexdigest() != source.get('sha256'):
                        raise ValueError('source changed')
                    if typ == 'DOCUMENT_SUPPORTED' and (not isinstance(source.get('quote'), str) or source['quote'].encode('utf-8') not in content):
                        raise ValueError('document quote not present')
                except (KeyError, OSError, ValueError, TypeError):
                    issues.append(field + ': source artifact missing or changed')
    if annotation.get('status') == 'needs-review' or any(v in ('review', 'conflict') for v in (annotation.get('fieldStates') or {}).values()) or annotation.get('suggestions') or annotation.get('fieldReviews'):
        issues.append('unresolved annotation conflict or review')
    return list(dict.fromkeys(issues))
