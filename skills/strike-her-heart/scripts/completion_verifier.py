"""Deterministic checks over saved runtime snapshots; this does not authenticate observations."""
import json
import re
from pathlib import Path


def read_private(root, value):
    if not isinstance(value, str):
        raise ValueError('missing private snapshot path')
    path = (Path(root) / value).resolve()
    path.relative_to(Path(root).resolve())
    if not path.is_file() or path.stat().st_size > 10 * 1024 * 1024:
        raise ValueError('snapshot missing or too large')
    return json.loads(path.read_text(encoding='utf-8'))


def verify(root, task, bundle, claims):
    problems = []
    pages = task.get('pages', [])
    entries = bundle.get('pages', []) if isinstance(bundle, dict) else []
    if not isinstance(entries, list):
        return ['页面清单格式无效']
    by_page = {entry.get('pageId'): entry for entry in entries if isinstance(entry, dict)}
    if not pages or len(by_page) != len(entries) or set(by_page) != {page['id'] for page in pages}:
        problems.append('页面清单与任务范围不一致')
    control_total = 0
    for page in pages:
        entry = by_page.get(page['id'], {})
        try:
            before = read_private(root, entry.get('before'))
            after = read_private(root, entry.get('after'))
            for snap in (before, after):
                if (snap.get('pageId'), snap.get('stateKey'), snap.get('url')) != (page['id'], page['stateKey'], page['url']):
                    raise ValueError('snapshot page/state mismatch')
                if snap.get('storageAvailable') is not True or snap.get('dirtyIds') or not isinstance(snap.get('persisted'), list):
                    raise ValueError('save unavailable or unsaved draft remains')
            if not before.get('sessionId') or not after.get('sessionId') or before['sessionId'] == after['sessionId']:
                raise ValueError('a distinct post-refresh runtime snapshot is required')
            binding_ids = {item['runtimeId']: item['displayId'] for item in page['bindings']}
            expected = set(binding_ids)
            old = {item['id']: item for item in before.get('controls', [])}
            new = {item['id']: item for item in after.get('controls', [])}
            old_saved = {item['id']: item for item in before['persisted']}
            saved = {item['id']: item for item in after['persisted']}
            if not expected or len(binding_ids) != len(page['bindings']) or set(old) != expected or set(new) != expected or len(old) != len(before.get('controls', [])) or len(new) != len(after.get('controls', [])) or len(old_saved) != len(before['persisted']) or len(saved) != len(after['persisted']):
                raise ValueError('detected controls do not match registered bindings')
            control_total += len(expected)
            for control_id in expected:
                item = new[control_id]
                if item.get('displayId') != binding_ids[control_id] or old[control_id].get('displayId') != binding_ids[control_id]:
                    raise ValueError('display number does not match the registered control')
                stored = saved.get(control_id)
                keys = ('fields', 'evidenceMeta', 'claimRecords', 'claimSources', 'manualFields', 'identity')
                prior = old_saved.get(control_id)
                if not stored or not prior or any(item.get(key) != stored.get(key) or old[control_id].get(key) != prior.get(key) or (key != 'identity' and old[control_id].get(key) != item.get(key)) for key in keys):
                    raise ValueError('save or refresh did not preserve annotation data')
                identity = item.get('identity') or {}
                if identity.get('mapping_confidence') != 1 or identity.get('match_status') in ('unresolved', 'detached', 'content-changed'):
                    raise ValueError('control identity needs review')
                if any(not isinstance(identity.get(key), str) or not re.fullmatch(r'[0-9a-f]{64}', identity[key]) for key in ('page_id', 'state_id', 'element_id', 'selector_fingerprint', 'content_hash')):
                    raise ValueError('control identity is incomplete')
                if any((old[control_id].get('identity') or {}).get(key) != identity.get(key) for key in ('page_id', 'state_id', 'element_id', 'selector_fingerprint', 'content_hash')):
                    raise ValueError('control identity changed across refresh')
                for field in old[control_id].get('manualFields', []):
                    if old[control_id].get('fields', {}).get(field) != item.get('fields', {}).get(field) or field not in item.get('manualFields', []):
                        raise ValueError('manual modification was not preserved')
                for issue in claims.check_annotation(item, root):
                    problems.append(page['id'] + '/' + item.get('displayId', control_id) + ': ' + issue)
        except (ValueError, TypeError, KeyError, AttributeError, OSError, json.JSONDecodeError) as error:
            problems.append(page['id'] + ': ' + str(error))
    report = bundle.get('report', {}) if isinstance(bundle, dict) else {}
    if report != {'pages': len(pages), 'verifiedPages': sum(page.get('status') == 'verified' for page in pages), 'controls': control_total}:
        problems.append('报告数量与登记页面及实际快照不一致')
    if any(page.get('status') != 'verified' for page in pages):
        problems.append('存在未验收或取消页面')
    return list(dict.fromkeys(problems))
