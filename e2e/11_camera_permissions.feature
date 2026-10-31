@camera-permissions
Feature: Camera permission recovery
  A camera permission request must follow the platform rules.
  Denial must leave a working Close action and a way to grant access later.

  Scenario Outline: Camera access follows the <case> flow
    Given I verify the camera permission flow "<case>"

    Examples:
      | case                      |
      | first-use-grant           |
      | first-use-deny            |
      | blocked-settings-return   |
      | granted-preview-and-close |
      | locked-camera-session     |
