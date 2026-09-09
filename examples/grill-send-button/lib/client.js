const GRILL_TRIGGER = "grill me";
function buildGrillSend(busy) {
  if (busy) return null;
  return GRILL_TRIGGER;
}
function apply(ctx) {
  const slots = ctx.get("slots");
  if (slots === void 0) return;
  slots.inject("conversation.input.right", () => slots.register(
    {
      name: "conversation.input.right",
      id: "grill-send",
      order: 1,
      label: () => "Send grill"
    },
    function SendGrillButton(props) {
      const inputActions = props.inputActions;
      const input = props.input;
      const busy = input && (input.phase === "adjudicating" || input.phase === "submitting");
      const message = buildGrillSend(Boolean(busy));
      const onClick = function() {
        if (message === null || !inputActions) return;
        inputActions.setDraft("");
        inputActions.setDraft(message);
        inputActions.submit();
      };
      return React.createElement(
        "button",
        {
          type: "button",
          disabled: message === null,
          title: 'Send the preset message "grill me"',
          onClick,
          style: { marginLeft: "4px", fontSize: "12px" }
        },
        "\u26A1 Grill"
      );
    }
  ));
}
const inject = ["slots"];
const name = "grill-send-button";
export {
  GRILL_TRIGGER,
  apply,
  buildGrillSend,
  inject,
  name
};
