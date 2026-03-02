import re
from typing import Dict, List, Optional


class MenuDetector:
    """Detector de menus no backend para evitar processamento de áudio em linhas de menu."""

    def __init__(self):
        self.line_buffer: List[Dict] = []
        self.min_menu_options = 2
        self.max_key_length = 3

        self.menu_patterns = [
            re.compile(r"^\[([a-zA-Z0-9]+)\]\s*-?\s*(.+)$"),
            re.compile(r"^([a-zA-Z0-9]+)\s*[-:.]\s*(.+)$"),
            re.compile(r"^([a-zA-Z0-9]+)\)\s*(.+)$"),
        ]

        self.prompt_patterns = [
            re.compile(r"enter your selection|escolha uma op[cç][aã]o|digite o n[uú]mero|digite.*letra", re.IGNORECASE),
            re.compile(r"select an option|make your choice|what.*do.*you.*want", re.IGNORECASE),
            re.compile(r"^>"),
        ]

    def process_line(self, line: str) -> List[Dict]:
        """
        Processa uma linha e retorna eventos:
        - {"type":"line", "content": "..."}
        - {"type":"menu", "payload": {"options": [...], "prompt": "..."}}
        - [] quando a linha é consumida pelo detector (parte de menu)
        """
        stripped = line.strip()

        if re.search(r"valid commands are:", stripped, re.IGNORECASE):
            self.line_buffer = []
            return [{"type": "line", "content": line}]

        if self._is_menu_terminator(line):
            if self._can_finalize_menu():
                menu = self._build_menu_payload()
                self.line_buffer = []
                return [{"type": "menu", "payload": menu}]

            flushed = self._flush_as_lines()
            flushed.append({"type": "line", "content": line})
            return flushed

        option = self._detect_menu_option(line)
        if option:
            self.line_buffer.append({"line": line, "option": option})
            return []

        if self._is_selection_prompt(line) and self._has_options_buffered():
            self.line_buffer.append({"line": line, "option": None, "is_prompt": True})
            if self._can_finalize_menu():
                menu = self._build_menu_payload()
                self.line_buffer = []
                return [{"type": "menu", "payload": menu}]

        if self._has_options_buffered() and self._can_finalize_menu():
            menu = self._build_menu_payload()
            self.line_buffer = []
            return [
                {"type": "menu", "payload": menu},
                {"type": "line", "content": line},
            ]

        if self._has_options_buffered() and not self._can_finalize_menu():
            flushed = self._flush_as_lines()
            flushed.append({"type": "line", "content": line})
            return flushed

        return [{"type": "line", "content": line}]

    def _detect_menu_option(self, line: str) -> Optional[Dict]:
        clean_line = line.strip()
        if not clean_line:
            return None

        if re.match(
            r"^\[[a-zA-Z]\]\s+.+\bhas\s+(?:entered\b|begun\s+to\s+generate\b)",
            clean_line,
            re.IGNORECASE,
        ):
            return None

        for pattern in self.menu_patterns:
            match = pattern.match(clean_line)
            if not match:
                continue

            key = match.group(1).strip()
            text = match.group(2).strip()
            if not self._is_valid_menu_key(key):
                continue

            is_number = key.isdigit()
            return {
                "key": key,
                "number": int(key) if is_number else None,
                "text": text,
                "isNumber": is_number,
            }

        return None

    def _is_valid_menu_key(self, key: str) -> bool:
        if len(key) > self.max_key_length:
            return False
        return key.isdigit() or bool(re.match(r"^[a-zA-Z]$", key))

    def _is_selection_prompt(self, line: str) -> bool:
        return any(pattern.search(line) for pattern in self.prompt_patterns)

    def _is_menu_terminator(self, line: str) -> bool:
        return bool(re.match(r"^\[input\]", line.strip(), re.IGNORECASE))

    def _has_options_buffered(self) -> bool:
        return any(item.get("option") for item in self.line_buffer)

    def _can_finalize_menu(self) -> bool:
        options = [item["option"] for item in self.line_buffer if item.get("option")]
        if len(options) < self.min_menu_options:
            return False

        all_numbers = all(opt.get("isNumber") for opt in options)
        all_letters = all(not opt.get("isNumber") for opt in options)
        if not all_numbers and not all_letters:
            return False

        if all_numbers:
            numbers = sorted(opt["number"] for opt in options if opt.get("number") is not None)
            if not numbers:
                return False
            span = numbers[-1] - numbers[0] + 1
            return span <= len(numbers) + 3

        return True

    def _build_menu_payload(self) -> Dict:
        options = [item["option"] for item in self.line_buffer if item.get("option")]
        prompt_item = next((item for item in self.line_buffer if item.get("is_prompt")), None)
        prompt = prompt_item["line"] if prompt_item else ""
        return {
            "options": options,
            "prompt": prompt,
            "source": "backend",
        }

    def _flush_as_lines(self) -> List[Dict]:
        flushed = [{"type": "line", "content": item["line"]} for item in self.line_buffer]
        self.line_buffer = []
        return flushed
