"""Run under xvfb-run to exercise real Tk tags, popovers and undo."""
import time
import pytest


@pytest.fixture
def ui():
    tk=pytest.importorskip('tkinter')
    try:
        root=tk.Tk()
    except tk.TclError:
        pytest.skip('A desktop display or xvfb-run is required')
    from openvoice.ocr_ui import SpellingController
    root.geometry('750x550')
    editor=tk.Text(root,undo=True,wrap='word');editor.pack(fill='both',expand=True)
    controller=SpellingController(root,editor,tk.StringVar())
    yield root,editor,controller
    controller.close();root.destroy()


def wait_for(root,predicate):
    end=time.monotonic()+10
    while not predicate():
        root.update()
        if time.monotonic()>end:
            pytest.fail('Timed out waiting for spelling UI')
        time.sleep(.02)


def test_clickable_word_popup_applies_suggestion_and_undo(ui):
    root,editor,controller=ui
    editor.insert('1.0','Teh freind.')
    root.update();controller.check()
    wait_for(root,lambda:bool(controller.issues))
    assert editor.tag_ranges('ocr_spelling')
    controller.show_issue('1.5')
    assert controller.popup is not None and controller.popup.winfo_exists()
    issue=next(i for i in controller.issues if i.original=='freind')
    controller.replace_issue(issue,issue.suggestions[0])
    assert editor.get('1.0','end-1c')=='Teh friend.'
    editor.edit_undo()
    assert editor.get('1.0','end-1c')=='Teh freind.'


def test_one_click_correction_is_one_undo_step(ui):
    root,editor,controller=ui
    original='Teh freind recieved a letter in the w0rld.'
    editor.insert('1.0',original)
    root.update();controller.correct_all()
    wait_for(root,lambda:editor.get('1.0','end-1c')!=original)
    assert editor.get('1.0','end-1c')=='The friend received a letter in the world.'
    editor.edit_undo()
    assert editor.get('1.0','end-1c')==original


def test_edit_invalidates_stale_results_and_personal_words_roundtrip(ui):
    root,editor,controller=ui
    editor.insert('1.0','teh freind')
    root.update();controller.check()
    editor.delete('1.0','end');editor.insert('1.0','correct text')
    root.update();controller.check()
    wait_for(root,lambda:controller.snapshot=='correct text')
    assert not controller.issues
    controller.add_word('Sakuragi')
    settings=controller.settings()
    assert 'sakuragi' in settings['spelling_words']
    controller.restore(settings)
    assert 'sakuragi' in controller.personal


def test_unicode_prefix_and_first_word_popup_offsets(ui):
    root,editor,controller=ui
    editor.insert('1.0','🌸 teh freind')
    root.update();controller.check()
    wait_for(root,lambda:bool(controller.issues))
    issue=next(i for i in controller.issues if i.original=='teh')
    controller.show_issue(controller._index(issue.start))
    assert controller.popup is not None
    controller.replace_issue(issue,'the')
    assert editor.get('1.0','end-1c')=='🌸 the freind'
