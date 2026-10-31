from openvoice.windowing import fitted_geometry, fitted_size


def test_common_desktop_sizes_fit():
    for width, height in [(640, 480), (800, 600), (1024, 600), (1280, 720), (1366, 768), (1920, 1080), (2560, 1440)]:
        for requested in [(1150, 750), (1020, 790), (1060, 730), (720, 600), (470, 250)]:
            actual_width, actual_height = fitted_size(width, height, *requested)
            assert 0 < actual_width <= requested[0]
            assert 0 < actual_height <= requested[1]
            assert actual_width <= width
            assert actual_height <= height
            parts = fitted_geometry(width, height, *requested).replace('+', 'x').split('x')
            assert int(parts[2]) >= 0
            assert int(parts[3]) >= 0
            assert int(parts[2]) + actual_width <= width
            assert int(parts[3]) + actual_height <= height


def test_windows_are_not_enlarged_needlessly():
    assert fitted_size(1920, 1080, 470, 250) == (470, 250)
    assert fitted_size(800, 600, 1020, 790)[0] < 800
    assert fitted_size(800, 600, 1020, 790)[1] < 600
