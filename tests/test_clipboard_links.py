from datetime import date

from clipboard_links import (
    build_target_directory,
    extract_links,
    normalize_base_directory,
)


def test_extracts_magnet_link_with_display_name() -> None:
    links = extract_links(
        "copied: magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Cool+Movie"
    )

    assert len(links) == 1
    assert links[0].kind == "magnet"
    assert links[0].url == (
        "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Cool+Movie"
    )
    assert links[0].name == "Cool Movie"


def test_extracts_ed2k_link_with_spaces_in_name() -> None:
    links = extract_links("ed2k://|file|Some File.mkv|12345|ABCDEF1234567890|/")

    assert len(links) == 1
    assert links[0].kind == "ed2k"
    assert links[0].url == "ed2k://|file|Some File.mkv|12345|ABCDEF1234567890|/"
    assert links[0].name == "Some File.mkv"


def test_extracts_multiple_links_dedupes_and_strips_trailing_punctuation() -> None:
    magnet = "magnet:?xt=urn:btih:abcdefabcdefabcdefabcdefabcdefabcdefabcd&dn=A"
    ed2k = "ed2k://|file|B.mp4|42|0123456789ABCDEF|/"
    text = f"{magnet}。\n{ed2k}), duplicate {magnet}"

    links = extract_links(text)

    assert [link.url for link in links] == [magnet, ed2k]


def test_build_target_directory_uses_yyyymmdd_child_folder() -> None:
    assert build_target_directory("/115open/javbus", date(2026, 7, 6)) == "/115open/javbus/20260706"
    assert build_target_directory("/115open/javbus/", date(2026, 7, 6)) == "/115open/javbus/20260706"


def test_directory_normalization_handles_empty_and_windows_style_paths() -> None:
    assert normalize_base_directory("") == ""
    assert build_target_directory("", date(2026, 7, 6)) == "/20260706"
    assert normalize_base_directory("\\115open\\javbus\\") == "/115open/javbus"
